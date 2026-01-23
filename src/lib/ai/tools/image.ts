// Image generation tool - uses Unsplash for free images

import { ToolResult } from './index';

const KEYWORD_MAP: Record<string, string> = {
    'hero': 'modern-interior',
    'banner': 'modern-interior',
    'chair': 'chair,furniture',
    'desk': 'desk,office',
    'table': 'desk,office',
    'bed': 'bedroom,bed',
    'bedroom': 'bedroom,bed',
    'sofa': 'sofa,living-room',
    'couch': 'sofa,living-room',
    'furniture': 'furniture,interior-design',
    'kitchen': 'kitchen,modern',
    'living': 'living-room,interior',
    'office': 'office,workspace',
    'home': 'home,interior',
    'modern': 'modern,minimal',
    'tech': 'technology,computer',
    'nature': 'nature,landscape',
    'city': 'city,urban',
    'food': 'food,cuisine',
    'team': 'team,business',
    'portrait': 'portrait,person',
};

export function generateImage(prompt: string): ToolResult {
    const lowerPrompt = prompt.toLowerCase();

    // Find matching keywords
    let searchTerm = 'furniture,home'; // default
    for (const [keyword, term] of Object.entries(KEYWORD_MAP)) {
        if (lowerPrompt.includes(keyword)) {
            searchTerm = term;
            break;
        }
    }

    // Use Unsplash Source API (free, no key needed)
    const randomSeed = Math.floor(Math.random() * 1000);
    const imageUrl = `https://source.unsplash.com/800x600/?${encodeURIComponent(searchTerm)}&sig=${randomSeed}`;

    return {
        success: true,
        data: JSON.stringify({ imageUrl, success: true, source: 'unsplash' })
    };
}
