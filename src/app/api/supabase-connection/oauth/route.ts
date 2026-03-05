import { NextRequest, NextResponse } from "next/server";

// GET: Initiate Supabase OAuth flow
// Opens in a popup - redirects to Supabase authorization page
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  const userId = req.nextUrl.searchParams.get("userId") || "";

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SUPABASE_OAUTH_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${req.nextUrl.origin}/api/supabase-connection/callback`;

  // Encode state with siteId and userId for the callback
  const state = Buffer.from(JSON.stringify({ siteId, userId })).toString("base64url");

  const authUrl = new URL("https://api.supabase.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
