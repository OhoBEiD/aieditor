import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SchemaTable {
  name: string;
  columns: Array<{ name: string; type: string; is_nullable: boolean }>;
}

async function fetchSchema(
  projectUrl: string,
  serviceRoleKey: string
): Promise<SchemaTable[]> {
  const sql = `
    SELECT
      t.table_name,
      json_agg(json_build_object(
        'name', c.column_name,
        'type', c.data_type,
        'is_nullable', c.is_nullable = 'YES'
      ) ORDER BY c.ordinal_position) as columns
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
    ORDER BY t.table_name;
  `;

  const res = await fetch(`${projectUrl}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  // Fallback: try the pg_meta endpoint (Supabase exposes this)
  if (!res.ok) {
    const tablesRes = await fetch(`${projectUrl}/rest/v1/?select=*`, {
      method: "HEAD",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    // Try fetching table list from OpenAPI spec
    const specRes = await fetch(`${projectUrl}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/openapi+json",
      },
    });

    if (specRes.ok) {
      try {
        const spec = await specRes.json();
        const tables: SchemaTable[] = [];
        const paths = spec.paths || {};
        for (const [path, methods] of Object.entries(paths)) {
          const tableName = path.replace(/^\//, "");
          if (!tableName || tableName.startsWith("rpc/")) continue;
          const getMethod = (methods as any)?.get;
          const columns: SchemaTable["columns"] = [];
          if (getMethod?.parameters) {
            for (const param of getMethod.parameters) {
              if (param.in === "query" && param.name !== "select" && param.name !== "order" && param.name !== "limit" && param.name !== "offset" && !param.name.startsWith("or") && !param.name.startsWith("and")) {
                columns.push({
                  name: param.name,
                  type: param.format || param.type || "unknown",
                  is_nullable: true,
                });
              }
            }
          }
          tables.push({ name: tableName, columns });
        }
        return tables;
      } catch {
        return [];
      }
    }
    return [];
  }

  const data = await res.json();
  return (data || []).map((row: any) => ({
    name: row.table_name,
    columns: row.columns || [],
  }));
}

// GET: Fetch connection status for a site
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("supabase_connections")
    .select("id, project_url, anon_key, schema_cache, is_connected, updated_at")
    .eq("site_id", siteId)
    .eq("is_connected", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    projectUrl: data.project_url,
    anonKey: data.anon_key,
    hasServiceRoleKey: true, // Don't expose the key itself
    schema: data.schema_cache,
    updatedAt: data.updated_at,
  });
}

// POST: Connect or update Supabase connection
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, projectUrl, anonKey, serviceRoleKey, refreshSchema, projectRef, userId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Handle schema refresh for existing connection
  if (refreshSchema) {
    const { data: existing } = await supabase
      .from("supabase_connections")
      .select("project_url, service_role_key")
      .eq("site_id", siteId)
      .eq("is_connected", true)
      .maybeSingle();

    if (!existing?.service_role_key) {
      return NextResponse.json({ error: "No service_role key to refresh schema" }, { status: 400 });
    }

    const tables = await fetchSchema(existing.project_url, existing.service_role_key);
    await supabase
      .from("supabase_connections")
      .update({ schema_cache: { tables }, updated_at: new Date().toISOString() })
      .eq("site_id", siteId);

    return NextResponse.json({ success: true, schema: { tables } });
  }

  // --- Auto-connect via projectRef (OAuth flow) ---
  // Fetches API keys from Supabase Management API using stored token
  if (projectRef && userId) {
    const { data: tokenData } = await supabase
      .from("supabase_management_tokens")
      .select("access_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tokenData?.access_token) {
      return NextResponse.json({ error: "No management token. Please connect to Supabase first." }, { status: 401 });
    }

    // Fetch API keys for the project
    const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!keysRes.ok) {
      const errText = await keysRes.text();
      return NextResponse.json({ error: `Failed to fetch API keys: ${errText}` }, { status: 400 });
    }

    const keys: Array<{ name: string; api_key: string }> = await keysRes.json();
    const fetchedAnonKey = keys.find((k) => k.name === "anon")?.api_key;
    const fetchedServiceKey = keys.find((k) => k.name === "service_role")?.api_key;

    if (!fetchedAnonKey) {
      return NextResponse.json({ error: "Could not find anon key for this project" }, { status: 400 });
    }

    const autoProjectUrl = `https://${projectRef}.supabase.co`;

    // Fetch schema if we have a service role key
    let schemaCache: { tables: SchemaTable[] } = { tables: [] };
    if (fetchedServiceKey) {
      const tables = await fetchSchema(autoProjectUrl, fetchedServiceKey);
      schemaCache = { tables };
    }

    // Upsert connection with auto-fetched keys
    const { data, error } = await supabase
      .from("supabase_connections")
      .upsert(
        {
          site_id: siteId,
          project_url: autoProjectUrl,
          anon_key: fetchedAnonKey,
          service_role_key: fetchedServiceKey || null,
          project_ref: projectRef,
          schema_cache: schemaCache,
          is_connected: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      projectUrl: autoProjectUrl,
      anonKey: fetchedAnonKey,
      hasServiceRoleKey: !!fetchedServiceKey,
      schema: schemaCache,
    });
  }

  // --- Manual connect (fallback) ---
  // Validate required fields
  if (!projectUrl || !anonKey) {
    return NextResponse.json({ error: "projectUrl and anonKey required" }, { status: 400 });
  }

  // Normalize URL (remove trailing slash)
  const normalizedUrl = projectUrl.replace(/\/+$/, "");

  // Validate credentials by pinging the project
  try {
    const testRes = await fetch(`${normalizedUrl}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!testRes.ok && testRes.status !== 200) {
      return NextResponse.json(
        { error: `Invalid credentials. Supabase returned ${testRes.status}.` },
        { status: 400 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: `Cannot reach ${normalizedUrl}: ${e.message}` },
      { status: 400 }
    );
  }

  // Fetch schema if service_role_key provided
  let schemaCache: { tables: SchemaTable[] } = { tables: [] };
  if (serviceRoleKey) {
    const tables = await fetchSchema(normalizedUrl, serviceRoleKey);
    schemaCache = { tables };
  }

  // Upsert connection
  const { data, error } = await supabase
    .from("supabase_connections")
    .upsert(
      {
        site_id: siteId,
        project_url: normalizedUrl,
        anon_key: anonKey,
        service_role_key: serviceRoleKey || null,
        schema_cache: schemaCache,
        is_connected: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    connected: true,
    projectUrl: normalizedUrl,
    hasServiceRoleKey: !!serviceRoleKey,
    schema: schemaCache,
  });
}

// DELETE: Disconnect Supabase
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { siteId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("supabase_connections")
    .update({ is_connected: false, updated_at: new Date().toISOString() })
    .eq("site_id", siteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, connected: false });
}
