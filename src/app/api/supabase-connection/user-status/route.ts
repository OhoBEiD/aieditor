import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ connected: false, error: "Not authenticated" }, { status: 401 });
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ connected: false, error: "Invalid token" }, { status: 401 });
        }

        // Check if user has a Supabase Management API token stored
        const { data: tokenRow } = await supabase
            .from("supabase_management_tokens")
            .select("access_token, updated_at")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

        if (!tokenRow?.access_token) {
            return NextResponse.json({ connected: false });
        }

        // Count how many Supabase project connections this user has
        const { count } = await supabase
            .from("supabase_connections")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

        return NextResponse.json({
            connected: true,
            projectCount: count || 0,
        });
    } catch (error: any) {
        console.error("Supabase user status error:", error);
        return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
    }
}
