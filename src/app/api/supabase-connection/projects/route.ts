import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  status: string;
  ref: string;
}

// GET: List user's Supabase projects using their stored management token
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Fetch the user's management token
  const { data: tokenData, error: tokenError } = await supabase
    .from("supabase_management_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenError || !tokenData) {
    return NextResponse.json({ authenticated: false, projects: [] });
  }

  // Check if token is expired
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    // Try to refresh the token
    const refreshed = await refreshToken(userId, tokenData.refresh_token);
    if (!refreshed) {
      // Token expired and can't refresh - user needs to re-auth
      await supabase.from("supabase_management_tokens").delete().eq("user_id", userId);
      return NextResponse.json({ authenticated: false, projects: [] });
    }
    tokenData.access_token = refreshed;
  }

  // Fetch projects from Supabase Management API
  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Token invalid, clean up
        await supabase.from("supabase_management_tokens").delete().eq("user_id", userId);
        return NextResponse.json({ authenticated: false, projects: [] });
      }
      const errText = await res.text();
      return NextResponse.json({ error: `Failed to fetch projects: ${errText}` }, { status: 500 });
    }

    const projects: SupabaseProject[] = await res.json();

    return NextResponse.json({
      authenticated: true,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        ref: p.ref || p.id,
        region: p.region,
        status: p.status,
        url: `https://${p.ref || p.id}.supabase.co`,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function refreshToken(userId: string, refreshToken: string | null): Promise<string | null> {
  if (!refreshToken) return null;

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://api.supabase.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) return null;

    const tokens = await res.json();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await supabase.from("supabase_management_tokens").update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return tokens.access_token;
  } catch {
    return null;
  }
}
