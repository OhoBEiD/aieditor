import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    private: boolean;
    default_branch: string;
    pushed_at: string;
    language: string | null;
}

export async function GET(request: NextRequest) {
    try {
        // Get user from auth header
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const token = authHeader.slice(7);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Invalid token' },
                { status: 401 }
            );
        }

        // Get user's GitHub token
        const { data: tokenData, error: tokenError } = await supabase
            .from('github_tokens')
            .select('access_token')
            .eq('user_id', user.id)
            .single();

        if (tokenError || !tokenData) {
            return NextResponse.json(
                { error: 'GitHub not connected', needsConnection: true },
                { status: 403 }
            );
        }

        // Fetch repos from GitHub
        const reposResponse = await fetch(
            'https://api.github.com/user/repos?sort=pushed&per_page=50&affiliation=owner,collaborator',
            {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Accept': 'application/vnd.github+json',
                },
            }
        );

        if (!reposResponse.ok) {
            if (reposResponse.status === 401) {
                // Token expired, need to reconnect
                return NextResponse.json(
                    { error: 'GitHub token expired', needsConnection: true },
                    { status: 403 }
                );
            }
            throw new Error('Failed to fetch repositories');
        }

        const repos: GitHubRepo[] = await reposResponse.json();

        // Format response
        return NextResponse.json({
            success: true,
            repos: repos.map((repo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                url: repo.html_url,
                description: repo.description,
                isPrivate: repo.private,
                defaultBranch: repo.default_branch,
                lastPushed: repo.pushed_at,
                language: repo.language,
            })),
        });
    } catch (error) {
        console.error('[GitHub Repos] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch repositories' },
            { status: 500 }
        );
    }
}
