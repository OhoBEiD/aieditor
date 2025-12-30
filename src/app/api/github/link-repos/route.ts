import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const githubToken = process.env.GITHUB_TOKEN!;
const githubOwner = process.env.GITHUB_OWNER || 'OhoBEiD';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
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

        // Get GitHub username from user metadata
        const githubUsername = user.user_metadata?.user_name || user.user_metadata?.preferred_username;

        if (!githubUsername) {
            return NextResponse.json(
                { error: 'No GitHub account linked' },
                { status: 400 }
            );
        }

        // Find all projects owned by this user that don't have github_username set
        const { data: projects, error: fetchError } = await supabase
            .from('sites')
            .select('id, name, repo_url')
            .eq('user_id', user.id)
            .is('github_username', null);

        if (fetchError) {
            console.error('[Link Repos] Fetch error:', fetchError);
            return NextResponse.json(
                { error: 'Failed to fetch projects' },
                { status: 500 }
            );
        }

        if (!projects || projects.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No projects to link',
                linkedCount: 0,
            });
        }

        console.log(`[Link Repos] Found ${projects.length} projects to link for user ${githubUsername}`);

        let linkedCount = 0;
        const errors: string[] = [];

        for (const project of projects) {
            try {
                // Extract repo name from URL (e.g., https://github.com/OhoBEiD/repo-name)
                const repoName = project.repo_url.split('/').pop();

                if (!repoName) {
                    errors.push(`Invalid repo URL for project ${project.id}`);
                    continue;
                }

                // Add user as collaborator via GitHub API
                const collabResponse = await fetch(
                    `https://api.github.com/repos/${githubOwner}/${repoName}/collaborators/${githubUsername}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${githubToken}`,
                            'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28',
                        },
                        body: JSON.stringify({
                            permission: 'push', // Can read and write
                        }),
                    }
                );

                if (!collabResponse.ok && collabResponse.status !== 201 && collabResponse.status !== 204) {
                    const errorData = await collabResponse.json().catch(() => ({}));

                    // Check if the error is safe to ignore (user is already owner)
                    const isOwnerError = collabResponse.status === 422 && (
                        errorData.message === 'Repository owner cannot be a collaborator' ||
                        errorData.errors?.some((e: any) => e.message === 'Repository owner cannot be a collaborator')
                    );

                    if (isOwnerError) {
                        console.log(`[Link Repos] User ${githubUsername} is already the owner of ${repoName}, skipping collaborator add.`);
                    } else {
                        console.error(`[Link Repos] Failed to add collaborator for ${repoName}:`, errorData);
                        errors.push(`Failed to add collaborator for ${repoName}`);
                        continue;
                    }
                }

                // Update the sites table with github_username
                const { error: updateError } = await supabase
                    .from('sites')
                    .update({ github_username: githubUsername })
                    .eq('id', project.id);

                if (updateError) {
                    console.error(`[Link Repos] Failed to update project ${project.id}:`, updateError);
                    errors.push(`Failed to update project ${project.id}`);
                    continue;
                }

                linkedCount++;
                console.log(`[Link Repos] Linked repo ${repoName} to ${githubUsername}`);
            } catch (err) {
                console.error(`[Link Repos] Error processing project ${project.id}:`, err);
                errors.push(`Error processing project ${project.id}`);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Linked ${linkedCount} of ${projects.length} projects`,
            linkedCount,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('[Link Repos] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
