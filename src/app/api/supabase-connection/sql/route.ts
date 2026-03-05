import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST: Execute SQL against user's connected Supabase project
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, sql } = body;

  if (!siteId || !sql) {
    return NextResponse.json({ error: "siteId and sql required" }, { status: 400 });
  }

  // Fetch the connection with service_role_key
  const { data: conn, error: connError } = await supabase
    .from("supabase_connections")
    .select("project_url, service_role_key")
    .eq("site_id", siteId)
    .eq("is_connected", true)
    .maybeSingle();

  if (connError || !conn) {
    return NextResponse.json({ error: "No active Supabase connection for this project" }, { status: 400 });
  }

  if (!conn.service_role_key) {
    return NextResponse.json(
      { error: "No service_role key configured. Cannot execute SQL. Ask the user to provide a service_role key in the Supabase connection settings." },
      { status: 400 }
    );
  }

  // Execute SQL via Supabase's REST API using the pg_net/rpc or direct SQL endpoint
  try {
    // Use the Supabase SQL endpoint (available via service_role)
    const res = await fetch(`${conn.project_url}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        apikey: conn.service_role_key,
        Authorization: `Bearer ${conn.service_role_key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ query: sql }),
    });

    // If the RPC endpoint doesn't work, try the management API approach
    if (!res.ok) {
      // Try using the Supabase Management API SQL endpoint
      // This requires the project ref and service role key
      const projectRef = extractProjectRef(conn.project_url);

      if (projectRef) {
        const mgmtRes = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${conn.service_role_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: sql }),
          }
        );

        if (mgmtRes.ok) {
          const data = await mgmtRes.json();
          return NextResponse.json({ success: true, data });
        }
      }

      // Fallback: use the PostgREST rpc endpoint with a custom function approach
      // Create and execute SQL via a temporary function
      const execSqlRes = await fetch(`${conn.project_url}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          apikey: conn.service_role_key,
          Authorization: `Bearer ${conn.service_role_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql_query: sql }),
      });

      if (execSqlRes.ok) {
        const data = await execSqlRes.json();
        return NextResponse.json({ success: true, data });
      }

      const errorText = await res.text();
      return NextResponse.json(
        { success: false, error: `SQL execution failed: ${errorText}` },
        { status: 400 }
      );
    }

    const data = await res.json();

    // After DDL statements, refresh the schema cache
    const sqlUpper = sql.trim().toUpperCase();
    if (sqlUpper.startsWith("CREATE") || sqlUpper.startsWith("ALTER") || sqlUpper.startsWith("DROP")) {
      refreshSchemaCache(siteId, conn.project_url, conn.service_role_key).catch(console.error);
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `SQL execution error: ${e.message}` },
      { status: 500 }
    );
  }
}

function extractProjectRef(url: string): string | null {
  // Extract project ref from URL like https://xyz.supabase.co
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || null;
}

async function refreshSchemaCache(siteId: string, projectUrl: string, serviceRoleKey: string) {
  // Trigger schema refresh via our own connection API
  const specRes = await fetch(`${projectUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/openapi+json",
    },
  });

  if (!specRes.ok) return;

  try {
    const spec = await specRes.json();
    const tables: any[] = [];
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      const tableName = path.replace(/^\//, "");
      if (!tableName || tableName.startsWith("rpc/")) continue;
      const getMethod = (methods as any)?.get;
      const columns: any[] = [];
      if (getMethod?.parameters) {
        for (const param of getMethod.parameters) {
          if (param.in === "query" && !["select", "order", "limit", "offset"].includes(param.name) && !param.name.startsWith("or") && !param.name.startsWith("and")) {
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

    await supabase
      .from("supabase_connections")
      .update({ schema_cache: { tables }, updated_at: new Date().toISOString() })
      .eq("site_id", siteId);
  } catch {
    // Non-critical, ignore
  }
}
