import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ connected: false, error: 'Not authenticated' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ connected: false, error: 'Invalid token' }, { status: 401 });
        }

        // Check if user has a GitHub token stored
        const { data: tokenRow } = await supabase
            .from('github_tokens')
            .select('access_token, updated_at')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (!tokenRow?.access_token) {
            return NextResponse.json({
                connected: false,
                username: user.user_metadata?.user_name || null,
            });
        }

        // Verify token is still valid with a lightweight GitHub API call
        const ghRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${tokenRow.access_token}` },
        });

        if (!ghRes.ok) {
            return NextResponse.json({
                connected: false,
                expired: true,
                username: user.user_metadata?.user_name || null,
            });
        }

        const ghUser = await ghRes.json();

        return NextResponse.json({
            connected: true,
            username: ghUser.login,
            avatarUrl: ghUser.avatar_url,
        });
    } catch (error: any) {
        console.error('GitHub token check error:', error);
        return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
    }
}
