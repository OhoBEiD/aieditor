import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface File {
    path: string;
    content: string;
}

export async function POST(req: NextRequest) {
    try {
        const { projectId, githubToken: clientToken, repoName, isPrivate = true, description } = await req.json();

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
        }

        // Resolve GitHub token: prefer server-side lookup, fall back to client-provided token
        let githubToken = clientToken;

        if (!githubToken) {
            const authHeader = req.headers.get('authorization');
            if (authHeader?.startsWith('Bearer ')) {
                const supabaseToken = authHeader.replace('Bearer ', '');
                const { data: { user } } = await supabase.auth.getUser(supabaseToken);
                if (user) {
                    const { data: tokenRow } = await supabase
                        .from('github_tokens')
                        .select('access_token')
                        .eq('user_id', user.id)
                        .limit(1)
                        .maybeSingle();
                    githubToken = tokenRow?.access_token;
                }
            }
        }

        if (!githubToken) {
            return NextResponse.json({ error: 'No GitHub token available. Please connect GitHub to your account.' }, { status: 401 });
        }

        // 1. Get Project Files
        const { data: files, error: filesError } = await supabase
            .from('project_files')
            .select('path, content')
            .eq('site_id', projectId);

        if (filesError) {
            console.error('Database error:', filesError);
            return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
        }

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files to sync' }, { status: 400 });
        }

        // 2. Create Repository on User's GitHub
        const finalRepoName = repoName || `automate-project-${Date.now()}`;
        console.log(`Creating repo ${finalRepoName} on GitHub user account...`);
        const createRes = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: finalRepoName,
                private: isPrivate,
                description: description || 'Created with Automate',
                auto_init: true,
            })
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            return NextResponse.json({ error: 'Failed to create GitHub repo', details: err }, { status: 500 });
        }

        const repoData = await createRes.json();
        const owner = repoData.owner.login;
        const repo = repoData.name;
        const defaultBranch = repoData.default_branch || 'main';

        // 3. Construct Tree Array
        const treeItems = files.map((f: File) => ({
            path: f.path,
            mode: '100644',
            type: 'blob',
            content: f.content
        }));

        // 4. Get latest commit SHA (base tree)
        const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
            headers: { 'Authorization': `Bearer ${githubToken}` }
        });

        let baseTreeSha: string | undefined = undefined;
        let parentCommitSha: string | undefined = undefined;

        if (refRes.ok) {
            const refData = await refRes.json();
            parentCommitSha = refData.object.sha;

            const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, {
                headers: { 'Authorization': `Bearer ${githubToken}` }
            });
            if (commitRes.ok) {
                const commitData = await commitRes.json();
                baseTreeSha = commitData.tree.sha;
            }
        }

        // 5. Create Tree
        const createTreeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            body: JSON.stringify({
                tree: treeItems,
                base_tree: baseTreeSha
            })
        });

        if (!createTreeRes.ok) {
            const err = await createTreeRes.json();
            return NextResponse.json({ error: 'Failed to create git tree', details: err }, { status: 500 });
        }

        const treeData = await createTreeRes.json();
        const newTreeSha = treeData.sha;

        // 6. Create Commit
        const createCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            body: JSON.stringify({
                message: 'Initial sync from Automate',
                tree: newTreeSha,
                parents: parentCommitSha ? [parentCommitSha] : []
            })
        });

        if (!createCommitRes.ok) {
            const err = await createCommitRes.json();
            return NextResponse.json({ error: 'Failed to create commit', details: err }, { status: 500 });
        }

        const commitData = await createCommitRes.json();
        const newCommitSha = commitData.sha;

        // 7. Update Ref (Head)
        const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            body: JSON.stringify({
                sha: newCommitSha
            })
        });

        if (!updateRefRes.ok) {
            const err = await updateRefRes.json();
            return NextResponse.json({ error: 'Failed to update ref', details: err }, { status: 500 });
        }

        // 8. Update DB site record
        await supabase.from('sites').update({
            repo_url: repoData.html_url
        }).eq('id', projectId);

        return NextResponse.json({
            success: true,
            repoUrl: repoData.html_url
        });

    } catch (error: any) {
        console.error('Sync error:', error);
        return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
    }
}
