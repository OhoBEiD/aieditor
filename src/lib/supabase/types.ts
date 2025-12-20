// Database types generated from Supabase schema

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            clients: {
                Row: {
                    id: string;
                    name: string;
                    email: string;
                    domain: string | null;
                    api_key: string;
                    settings: Json;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    email: string;
                    domain?: string | null;
                    api_key: string;
                    settings?: Json;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    email?: string;
                    domain?: string | null;
                    api_key?: string;
                    settings?: Json;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            chat_sessions: {
                Row: {
                    id: string;
                    client_id: string;
                    title: string;
                    is_active: boolean;
                    metadata: Json;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    client_id: string;
                    title?: string;
                    is_active?: boolean;
                    metadata?: Json;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    client_id?: string;
                    title?: string;
                    is_active?: boolean;
                    metadata?: Json;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            messages: {
                Row: {
                    id: string;
                    session_id: string;
                    role: 'user' | 'assistant' | 'system';
                    content: string;
                    metadata: Json;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    session_id: string;
                    role: 'user' | 'assistant' | 'system';
                    content: string;
                    metadata?: Json;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    session_id?: string;
                    role?: 'user' | 'assistant' | 'system';
                    content?: string;
                    metadata?: Json;
                    created_at?: string;
                };
            };
            code_versions: {
                Row: {
                    id: string;
                    client_id: string;
                    session_id: string | null;
                    message_id: string | null;
                    file_path: string;
                    action: 'create' | 'modify' | 'delete';
                    previous_content: string | null;
                    new_content: string | null;
                    change_description: string | null;
                    change_data: Json | null;
                    is_applied: boolean;
                    is_reverted: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    client_id: string;
                    session_id?: string | null;
                    message_id?: string | null;
                    file_path: string;
                    action: 'create' | 'modify' | 'delete';
                    previous_content?: string | null;
                    new_content?: string | null;
                    change_description?: string | null;
                    change_data?: Json | null;
                    is_applied?: boolean;
                    is_reverted?: boolean;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    client_id?: string;
                    session_id?: string | null;
                    message_id?: string | null;
                    file_path?: string;
                    action?: 'create' | 'modify' | 'delete';
                    previous_content?: string | null;
                    new_content?: string | null;
                    change_description?: string | null;
                    change_data?: Json | null;
                    is_applied?: boolean;
                    is_reverted?: boolean;
                    created_at?: string;
                };
            };
            agent_memory: {
                Row: {
                    id: string;
                    client_id: string;
                    memory_type: 'preference' | 'style' | 'component' | 'instruction' | 'context';
                    key: string;
                    value: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    client_id: string;
                    memory_type: 'preference' | 'style' | 'component' | 'instruction' | 'context';
                    key: string;
                    value: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    client_id?: string;
                    memory_type?: 'preference' | 'style' | 'component' | 'instruction' | 'context';
                    key?: string;
                    value?: string;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            uploaded_assets: {
                Row: {
                    id: string;
                    client_id: string;
                    file_name: string;
                    file_path: string;
                    file_type: string;
                    file_size: number | null;
                    storage_url: string;
                    metadata: Json;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    client_id: string;
                    file_name: string;
                    file_path: string;
                    file_type: string;
                    file_size?: number | null;
                    storage_url: string;
                    metadata?: Json;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    client_id?: string;
                    file_name?: string;
                    file_path?: string;
                    file_type?: string;
                    file_size?: number | null;
                    storage_url?: string;
                    metadata?: Json;
                    created_at?: string;
                };
            };
            event_logs: {
                Row: {
                    id: string;
                    client_id: string | null;
                    event_type: string;
                    workflow_name: string | null;
                    action: string | null;
                    duration_ms: number | null;
                    tokens_used: number | null;
                    success: boolean;
                    error_message: string | null;
                    metadata: Json;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    client_id?: string | null;
                    event_type: string;
                    workflow_name?: string | null;
                    action?: string | null;
                    duration_ms?: number | null;
                    tokens_used?: number | null;
                    success?: boolean;
                    error_message?: string | null;
                    metadata?: Json;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    client_id?: string | null;
                    event_type?: string;
                    workflow_name?: string | null;
                    action?: string | null;
                    duration_ms?: number | null;
                    tokens_used?: number | null;
                    success?: boolean;
                    error_message?: string | null;
                    metadata?: Json;
                    created_at?: string;
                };
            };
        };
        Views: {
            v_chat_sessions_summary: {
                Row: {
                    id: string;
                    client_id: string;
                    title: string;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                    message_count: number;
                    last_message_at: string | null;
                };
            };
        };
    };
}

// Helper types
export type Client = Database['public']['Tables']['clients']['Row'];
export type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type CodeVersion = Database['public']['Tables']['code_versions']['Row'];
export type AgentMemory = Database['public']['Tables']['agent_memory']['Row'];
export type UploadedAsset = Database['public']['Tables']['uploaded_assets']['Row'];
export type EventLog = Database['public']['Tables']['event_logs']['Row'];

// Insert types
export type InsertChatSession = Database['public']['Tables']['chat_sessions']['Insert'];
export type InsertMessage = Database['public']['Tables']['messages']['Insert'];
export type InsertCodeVersion = Database['public']['Tables']['code_versions']['Insert'];

// View types
export type ChatSessionSummary = Database['public']['Views']['v_chat_sessions_summary']['Row'];
