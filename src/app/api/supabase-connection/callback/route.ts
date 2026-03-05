import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: Handle Supabase OAuth callback
// Exchanges authorization code for access token, stores it, and closes the popup
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateB64 = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return htmlResponse(`
      <p style="color:red;">Authorization failed: ${error}</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);
  }

  if (!code) {
    return htmlResponse(`
      <p>No authorization code received.</p>
      <script>window.close();</script>
    `);
  }

  // Decode state
  let state: { siteId?: string; userId?: string } = {};
  if (stateB64) {
    try {
      state = JSON.parse(Buffer.from(stateB64, "base64url").toString());
    } catch {
      state = {};
    }
  }

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return htmlResponse(`
      <p style="color:red;">Server misconfigured: missing OAuth credentials.</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);
  }

  // Exchange authorization code for tokens
  try {
    const tokenRes = await fetch("https://api.supabase.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${req.nextUrl.origin}/api/supabase-connection/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Supabase OAuth] Token exchange failed:", errText);
      return htmlResponse(`
        <p style="color:red;">Token exchange failed. Please try again.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      `);
    }

    const tokens = await tokenRes.json();

    // Store the management token
    const userId = state.userId;
    if (userId) {
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;

      await supabase.from("supabase_management_tokens").upsert(
        {
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_type: tokens.token_type || "bearer",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    // Close popup and notify parent window
    return htmlResponse(`
      <div style="text-align:center;padding:40px;font-family:system-ui;">
        <div style="font-size:48px;margin-bottom:16px;">&#10003;</div>
        <p style="font-size:18px;font-weight:600;">Connected to Supabase!</p>
        <p style="color:#666;">This window will close automatically...</p>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'supabase-oauth-complete',
            siteId: '${state.siteId || ""}',
            userId: '${state.userId || ""}'
          }, '*');
        }
        setTimeout(() => window.close(), 1500);
      </script>
    `);
  } catch (e: any) {
    console.error("[Supabase OAuth] Error:", e);
    return htmlResponse(`
      <p style="color:red;">An error occurred: ${e.message}</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);
  }
}

function htmlResponse(body: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Supabase Connect</title></head><body>${body}</body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
