import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const githubToken = process.env.GITHUB_TOKEN!;
const githubOwner = process.env.GITHUB_OWNER || 'OhoBEiD';
const templateRepo = process.env.GITHUB_TEMPLATE_REPO || 'automate-starter-template';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateProjectName(): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `automate-project-${timestamp}-${randomSuffix}`;
}

function generateSiteKey(): string {
    return `site_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { initialMessage, userId } = body;

        if (!initialMessage) {
            return NextResponse.json(
                { error: 'Initial message is required' },
                { status: 400 }
            );
        }

        // 1. Generate unique repo name
        const repoName = generateProjectName();

        // 2. Create repo from template via GitHub API (with 30s timeout)
        const createRepoResponse = await fetch(
            `https://api.github.com/repos/${githubOwner}/${templateRepo}/generate`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                body: JSON.stringify({
                    owner: githubOwner,
                    name: repoName,
                    description: `AutoMate project: ${initialMessage.substring(0, 100)}`,
                    private: true, // Private repos - user gets access when they link GitHub
                    include_all_branches: false,
                }),
                signal: AbortSignal.timeout(30000), // 30 second timeout
            }
        );

        if (!createRepoResponse.ok) {
            const errorData = await createRepoResponse.json();
            console.error('[API] GitHub repo creation failed:', errorData);
            return NextResponse.json(
                { error: 'Failed to create GitHub repository', details: errorData },
                { status: 500 }
            );
        }

        const newRepo = await createRepoResponse.json();
        console.log('[API] Created repo:', newRepo.html_url);

        // Wait for GitHub to fully initialize the repository and default branch
        // This prevents "Remote branch main not found" errors when cloning immediately
        console.log('[API] ⏳ Waiting 3s for GitHub to initialize repository...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 3. Generate site key and subdomain
        const siteKey = generateSiteKey();
        const previewSubdomain = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // 4. Insert into sites table
        const { data: site, error: dbError } = await supabase
            .from('sites')
            .insert({
                name: repoName,
                repo_url: newRepo.html_url,
                default_branch: newRepo.default_branch || 'main',
                stack: 'nextjs',
                site_key: siteKey,
                preview_subdomain: previewSubdomain,
                source_type: 'new',
                user_id: userId || null,
                description: initialMessage.substring(0, 500),
            })
            .select()
            .single();

        if (dbError) {
            console.error('[API] Database insert failed:', dbError);
            return NextResponse.json(
                { error: 'Failed to save project', details: dbError },
                { status: 500 }
            );
        }

        console.log('[API] Project created:', site.id);

        // 5. Initialize preview workspace (Async / Fire-and-Forget)
        // We trigger the start but don't wait for it, ensuring fast response.
        console.log(`[API] 🚀 Triggering background preview start for ${site.site_key}...`);

        // NO AWAIT here - intentional fire-and-forget
        fetch('https://preview-orchestrator.fly.dev/preview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                siteId: site.site_key,
                repoUrl: newRepo.clone_url,
                branch: newRepo.default_branch || 'main'
            }),
            // Short timeout to ensure we don't hang if the network is weird, 
            // but we aren't awaiting the full process anyway.
            // signal: AbortSignal.timeout(5000) // REMOVED: Don't abort, let it run in background!
        }).catch(err => {
            // Log as info since this is detached
            console.log(`[API] ℹ️ Background preview trigger detached (expected for speed):`, err.message);
        });

        return NextResponse.json({
            success: true,
            project: {
                id: site.id,
                siteKey: site.site_key,
                name: site.name,
                repoUrl: site.repo_url,
                previewSubdomain: site.preview_subdomain,
                previewUrl: `https://${site.site_key}.preview.automatelb.com`,
                // We return false because it's not ready YET, but it will be soon.
                previewReady: false,
                previewError: undefined,
            },
        });
    } catch (error) {
        console.error('[API] Create project error:', error);

        // Handle timeout errors specifically
        if (error instanceof Error) {
            if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('Timeout')) {
                return NextResponse.json(
                    { error: 'GitHub API request timed out. Please try again.' },
                    { status: 504 }
                );
            }

            if (error.message.includes('fetch failed')) {
                return NextResponse.json(
                    { error: 'Failed to connect to GitHub. Please check your internet connection and try again.' },
                    { status: 503 }
                );
            }

            return NextResponse.json(
                { error: error.message || 'Failed to create project' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
