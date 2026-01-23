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
        const { projectId, githubToken, repoName } = await req.json();

        if (!projectId || !githubToken) {
            return NextResponse.json({ error: 'Missing projectId or githubToken' }, { status: 400 });
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
        console.log(`Creating repo ${repoName} on GitHub user account...`);
        const createRes = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: repoName,
                private: true,
                auto_init: true, // Init with README so main branch exists? Or false and we create it?
                // Empty repo is better for creating initial commit from scratch.
                // But default branch creation via API needs a parent or we create ref directly.
                // Actually, 'auto_init: true' creates a commit. Then we can get latest commit and update it?
                // Or 'auto_init: false' and we create 'git/commits'? 
                // To create a commit in empty repo (no parents), we need to handle it.
                // Easiest: auto_init=true, then get main SHA, create new tree based on it (or just new tree), commit, updating ref.
            })
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            return NextResponse.json({ error: 'Failed to create GitHub repo', details: err }, { status: 500 });
        }

        const repoData = await createRes.json();
        const owner = repoData.owner.login;
        const repo = repoData.name;
        const defaultBranch = repoData.default_branch || 'main'; // auto_init usually sets main

        // 3. Create Blobs for all files
        // Optimization: Create blobs in parallel
        // For simple usage, we can construct the tree directly if content is text.
        // GitHub Tree API allows specifying content directly for text files?
        // Yes, "content" field in tree creation if executable bit not needed?
        // Wait, "create a tree": tree.tree array can contain "content" (string) or "sha" (blob).

        // Construct Tree Array
        const treeItems = files.map((f: File) => ({
            path: f.path,
            mode: '100644', // file
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

            // Get commit to get tree
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
                base_tree: baseTreeSha // Update on top of README if auto_init
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
                message: 'Initial sync from AutoMate',
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
