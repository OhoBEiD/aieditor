// Intent Classifier - determines what type of request the user is making
// Uses regex for fast path, falls back to LLM for ambiguous cases

import { INTENT_CLASSIFICATION_PROMPT } from '../prompts/system';

export interface IntentResult {
    type: 'simple_edit' | 'complex_feature' | 'question' | 'clarification' | 'ui_task' | 'backend_task';
    confidence: number;
    needsPlanner: boolean;
    source: 'regex' | 'llm' | 'fallback';
}

// Regex patterns for fast classification
const SIMPLE_EDIT_PATTERNS = [
    /^(change|update|set|fix|replace|modify)\s+(the\s+)?(title|text|heading|name|color|background|font|size|padding|margin)/i,
    /^make\s+(it|the|this)\s+(bigger|smaller|larger|bolder|darker|lighter|centered)/i,
    /^(remove|delete|hide)\s+(the\s+)?\w{2,20}$/i,
    /^(add|put|insert)\s+(a\s+)?(comma|period|space|word)/i
];

const QUESTION_PATTERNS = [
    /^(what|why|how|can you|could you|should|is it|explain|describe|tell me|where|when|who)/i,
    /^(do you|does it|have you|will it)/i,
    /\?\s*$/
];

const COMPLEX_KEYWORDS = [
    'implement', 'create', 'build', 'add feature', 'new page', 'new component',
    'integrate', 'api', 'database', 'authentication', 'form with', 'multiple',
    'landing page', 'website', 'app', 'dashboard'
];

// UI-focused keywords (route to Vercel AI)
const UI_KEYWORDS = [
    'button', 'card', 'modal', 'navbar', 'header', 'footer', 'sidebar',
    'form', 'input', 'dropdown', 'menu', 'carousel', 'slider', 'hero',
    'layout', 'grid', 'flex', 'responsive', 'mobile', 'animation',
    'style', 'css', 'tailwind', 'color', 'theme', 'dark mode',
    'component', 'ui', 'ux', 'design', 'page', 'section'
];

// Backend-focused keywords (route to Mastra)
const BACKEND_KEYWORDS = [
    'api', 'endpoint', 'route', 'server', 'database', 'supabase', 'prisma',
    'authentication', 'auth', 'middleware', 'webhook', 'cron', 'service',
    'error', 'debug', 'fix bug', 'typescript', 'type', 'interface',
    'function', 'utility', 'helper', 'config', 'env', 'backend'
];

export function classifyIntentFast(message: string): IntentResult | null {
    const msgLower = message.toLowerCase();

    const isSimple = SIMPLE_EDIT_PATTERNS.some(p => p.test(message));
    const isQuestion = QUESTION_PATTERNS.some(p => p.test(message));
    const hasComplexKeyword = COMPLEX_KEYWORDS.some(k => msgLower.includes(k));
    const hasUIKeyword = UI_KEYWORDS.some(k => msgLower.includes(k));
    const hasBackendKeyword = BACKEND_KEYWORDS.some(k => msgLower.includes(k));

    if (isQuestion && !hasComplexKeyword) {
        return { type: 'question', confidence: 0.9, needsPlanner: false, source: 'regex' };
    }

    // Route to specific agent based on keyword dominance
    if (hasBackendKeyword && !hasUIKeyword) {
        return { type: 'backend_task', confidence: 0.85, needsPlanner: true, source: 'regex' };
    }
    if (hasUIKeyword && !hasBackendKeyword) {
        return { type: 'ui_task', confidence: 0.85, needsPlanner: false, source: 'regex' };
    }

    if (isSimple && !hasComplexKeyword) {
        return { type: 'simple_edit', confidence: 0.9, needsPlanner: false, source: 'regex' };
    }
    if (hasComplexKeyword) {
        return { type: 'complex_feature', confidence: 0.85, needsPlanner: true, source: 'regex' };
    }

    return null; // Need LLM classification
}

export async function classifyIntentWithLLM(message: string): Promise<IntentResult> {
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_KEY) {
        console.error('Missing OPENROUTER_API_KEY');
        return { type: 'simple_edit', confidence: 0.5, needsPlanner: true, source: 'fallback' };
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://automate.ai',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [{
                    role: 'user',
                    content: INTENT_CLASSIFICATION_PROMPT.replace('{message}', message.substring(0, 300))
                }],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '{}';
        const match = text.match(/\{[^}]+\}/);
        const intent = JSON.parse(match?.[0] || '{"type":"simple_edit","confidence":0.5}');

        return {
            type: intent.type || 'simple_edit',
            confidence: intent.confidence || 0.5,
            needsPlanner: intent.type === 'complex_feature' || intent.confidence < 0.7,
            source: 'llm'
        };
    } catch (e) {
        console.error('LLM classification error:', e);
        return { type: 'simple_edit', confidence: 0.5, needsPlanner: true, source: 'fallback' };
    }
}

export async function classifyIntent(message: string): Promise<IntentResult> {
    // Try fast regex classification first
    const fastResult = classifyIntentFast(message);
    if (fastResult) return fastResult;

    // Fall back to LLM
    return classifyIntentWithLLM(message);
}
