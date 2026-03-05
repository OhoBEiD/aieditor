// Web tools - search (Serper/Google) and scrape (server-side fetch)

import { ToolResult } from './index';

// --- HTML stripping utility ---

function stripHtml(html: string): { title: string; content: string } {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Remove script, style, nav, footer blocks
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '');

    // Strip HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return { title, content: text };
}

// --- Serper Web Search (Google results) ---

export async function webSearch(query: string, maxResults: number = 5): Promise<ToolResult> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        return { success: false, error: 'SERPER_API_KEY not configured. Add it to .env.local to enable web search.' };
    }

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query,
                num: Math.min(maxResults || 5, 10),
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return { success: false, error: `Serper API error: ${response.status} - ${errText}` };
        }

        const data = await response.json();
        const organic = (data.organic || []).slice(0, maxResults).map((r: any) => ({
            title: r.title,
            url: r.link,
            snippet: (r.snippet || '').substring(0, 300),
        }));

        // Include knowledge graph if available
        const knowledgeGraph = data.knowledgeGraph
            ? { title: data.knowledgeGraph.title, description: data.knowledgeGraph.description }
            : undefined;

        return {
            success: true,
            data: JSON.stringify({ results: organic, knowledgeGraph, query }),
        };
    } catch (e: any) {
        return { success: false, error: `Web search failed: ${e.message}` };
    }
}

// --- Web Scrape ---

export async function webScrape(url: string, maxLength: number = 5000): Promise<ToolResult> {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { success: false, error: 'Only HTTP/HTTPS URLs are supported' };
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AutomateBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml,text/plain',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return { success: false, error: `Failed to fetch URL: ${response.status} ${response.statusText}` };
        }

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        // Plain text or JSON — return directly
        if (contentType.includes('text/plain') || contentType.includes('application/json')) {
            return {
                success: true,
                data: JSON.stringify({
                    title: url,
                    content: body.substring(0, maxLength),
                    url,
                }),
            };
        }

        // HTML — strip tags and extract text
        const { title, content } = stripHtml(body);

        return {
            success: true,
            data: JSON.stringify({
                title: title || url,
                content: content.substring(0, maxLength),
                url,
            }),
        };
    } catch (e: any) {
        return { success: false, error: `Web scrape failed: ${e.message}` };
    }
}
