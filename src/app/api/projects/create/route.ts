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

        // 2. Create repo from template via GitHub API
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

        // 5. Initialize preview workspace (non-blocking)
        // This clones the repo, installs deps, and starts the dev server
        // CRITICAL: Use site_key as siteId for preview subdomain routing
        fetch('https://preview-orchestrator.fly.dev/preview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                siteId: site.site_key,  // Use site_key, not site.id!
                repoUrl: newRepo.clone_url,
                branch: newRepo.default_branch || 'main'
            })
        }).then(async (res) => {
            if (res.ok) {
                const previewData = await res.json();
                console.log(`[API] ✅ Preview initialized for ${site.site_key}:`, previewData.previewUrl);
            } else {
                const errorText = await res.text();
                console.error(`[API] ❌ Preview initialization failed for ${site.site_key}:`, errorText);
            }
        }).catch(err => {
            console.error(`[API] ❌ Preview initialization error for ${site.site_key}:`, err);
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
            },
        });
    } catch (error) {
        console.error('[API] Create project error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
