import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const githubToken = process.env.GITHUB_TOKEN!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateSiteKey(): string {
    return `site_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // Match patterns like:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);

    const match = httpsMatch || sshMatch;
    if (!match) return null;

    return { owner: match[1], repo: match[2] };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { repoUrl, userId } = body;

        if (!repoUrl) {
            return NextResponse.json(
                { error: 'Repository URL is required' },
                { status: 400 }
            );
        }

        // 1. Parse and validate GitHub URL
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            return NextResponse.json(
                { error: 'Invalid GitHub repository URL' },
                { status: 400 }
            );
        }

        // 2. Verify repo exists and is accessible
        const repoResponse = await fetch(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
            {
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                    'Accept': 'application/vnd.github+json',
                },
            }
        );

        if (!repoResponse.ok) {
            return NextResponse.json(
                { error: 'Repository not found or not accessible' },
                { status: 404 }
            );
        }

        const repoData = await repoResponse.json();
        console.log('[API] Importing repo:', repoData.html_url);

        // 3. Check if repo is already imported
        const { data: existing } = await supabase
            .from('sites')
            .select('id')
            .eq('repo_url', repoData.html_url)
            .single();

        if (existing) {
            return NextResponse.json(
                { error: 'This repository has already been imported', existingId: existing.id },
                { status: 409 }
            );
        }

        // 4. Generate site key and subdomain
        const siteKey = generateSiteKey();
        const previewSubdomain = parsed.repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // 5. Insert into sites table
        const { data: site, error: dbError } = await supabase
            .from('sites')
            .insert({
                name: repoData.name,
                repo_url: repoData.html_url,
                default_branch: repoData.default_branch || 'main',
                stack: 'unknown', // Could detect from package.json later
                site_key: siteKey,
                preview_subdomain: previewSubdomain,
                source_type: 'imported',
                user_id: userId || null,
                description: repoData.description || null,
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

        console.log('[API] Project imported:', site.id);

        return NextResponse.json({
            success: true,
            project: {
                id: site.id,
                siteKey: site.site_key,
                name: site.name,
                repoUrl: site.repo_url,
                previewSubdomain: site.preview_subdomain,
            },
        });
    } catch (error) {
        console.error('[API] Import project error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
