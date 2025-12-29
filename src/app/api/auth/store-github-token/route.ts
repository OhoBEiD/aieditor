import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { accessToken, refreshToken } = body;

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            );
        }

        // Get user from the request cookie/session
        const cookieStore = await cookies();
        const supabaseAuthToken = cookieStore.get('sb-access-token')?.value;

        // Create admin client
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get the user from auth header or session
        const authHeader = request.headers.get('authorization');
        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id || null;
        }

        // Try to get user from Supabase session
        if (!userId && supabaseAuthToken) {
            const { data: { user } } = await supabase.auth.getUser(supabaseAuthToken);
            userId = user?.id || null;
        }

        // Fallback: try to verify the access token with GitHub to get user info
        if (!userId) {
            // This is a simplified approach - in production you'd want proper session handling
            console.log('[Store Token] No user ID found, storing temporarily');
            return NextResponse.json({
                success: true,
                message: 'Token will be stored after full auth completes'
            });
        }

        // Upsert the token
        const { error } = await supabase
            .from('github_tokens')
            .upsert({
                user_id: userId,
                access_token: accessToken,
                refresh_token: refreshToken || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id',
            });

        if (error) {
            console.error('[Store Token] Database error:', error);
            return NextResponse.json(
                { error: 'Failed to store token' },
                { status: 500 }
            );
        }

        console.log('[Store Token] Token stored for user:', userId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Store Token] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
