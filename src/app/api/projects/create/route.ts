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

        // 1. Generate unique project details
        const repoName = generateProjectName();
        const siteKey = generateSiteKey();
        const previewSubdomain = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        console.log('[API] Creating new local project:', repoName);

        // 2. Insert into sites table (Local project, no GitHub repo yet)
        const { data: site, error: dbError } = await supabase
            .from('sites')
            .insert({
                name: repoName,
                repo_url: "", // Empty string indicates local project not yet synced
                default_branch: 'main',
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

        console.log('[API] Project created locally:', site.id);

        return NextResponse.json({
            success: true,
            project: {
                id: site.id,
                siteKey: site.site_key,
                name: site.name,
                repoUrl: site.repo_url,
                previewSubdomain: site.preview_subdomain,
                previewReady: false,
                previewError: undefined,
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
