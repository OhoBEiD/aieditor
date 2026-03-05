import { NextRequest, NextResponse } from 'next/server';

const VERCEL_API = 'https://api.vercel.com';

export async function POST(request: NextRequest) {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
        return NextResponse.json(
            { error: 'VERCEL_TOKEN not configured. Add it to your .env.local file.' },
            { status: 500 }
        );
    }

    try {
        const { files, projectName } = await request.json();

        if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
            return NextResponse.json(
                { error: 'No files provided for deployment' },
                { status: 400 }
            );
        }

        // Build the files array for Vercel API
        const vercelFiles = Object.entries(files).map(([filePath, content]) => ({
            file: filePath.startsWith('/') ? filePath.slice(1) : filePath,
            data: Buffer.from(content as string).toString('base64'),
            encoding: 'base64' as const,
        }));

        // Create deployment
        const deployBody: Record<string, any> = {
            name: projectName || 'automate-deploy',
            files: vercelFiles,
            projectSettings: {
                framework: 'nextjs',
            },
        };

        // If a project ID is configured, deploy to that project
        const vercelProjectId = process.env.VERCEL_PROJECT_ID;
        if (vercelProjectId) {
            deployBody.project = vercelProjectId;
        }

        // If a team ID is configured, deploy under that team
        const vercelTeamId = process.env.VERCEL_TEAM_ID;
        const teamQuery = vercelTeamId ? `?teamId=${vercelTeamId}` : '';

        const response = await fetch(`${VERCEL_API}/v13/deployments${teamQuery}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${vercelToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(deployBody),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Vercel deploy error:', data);
            return NextResponse.json(
                { error: data.error?.message || 'Deployment failed' },
                { status: response.status }
            );
        }

        return NextResponse.json({
            status: 'deployed',
            url: `https://${data.url}`,
            deploymentId: data.id,
            readyState: data.readyState,
        });
    } catch (error) {
        console.error('Deploy error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Deployment failed' },
            { status: 500 }
        );
    }
}
