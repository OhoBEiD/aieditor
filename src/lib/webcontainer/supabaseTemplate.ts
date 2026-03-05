// Template files injected into the WebContainer project when Supabase is connected

export function getSupabaseClientTemplate(): string {
    return `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;
}

export function getSupabaseEnvTemplate(projectUrl: string, anonKey: string): string {
    return `NEXT_PUBLIC_SUPABASE_URL=${projectUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
`;
}
