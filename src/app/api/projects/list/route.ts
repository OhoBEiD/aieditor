import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        // Build query
        let query = supabase
            .from('sites')
            .select('id, name, repo_url, site_key, preview_subdomain, source_type, description, created_at, updated_at')
            .order('updated_at', { ascending: false });

        // Filter by user if provided
        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: projects, error } = await query.limit(50);

        if (error) {
            console.error('[API] Failed to fetch projects:', error);
            return NextResponse.json(
                { error: 'Failed to fetch projects' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            projects: projects.map((p) => ({
                id: p.id,
                name: p.name,
                siteKey: p.site_key,
                repoUrl: p.repo_url,
                previewSubdomain: p.preview_subdomain,
                sourceType: p.source_type,
                description: p.description,
                createdAt: p.created_at,
                updatedAt: p.updated_at,
            })),
        });
    } catch (error) {
        console.error('[API] List projects error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
