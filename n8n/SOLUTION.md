# Solution: n8n Tool Input Access

## The Problem

The tools are receiving the workflow context object instead of the actual tool input:
```
{"siteId":"site_...", "conversationId":"...", ...}
```

Instead of the tool parameter like:
```
src/app/page.tsx|||<code here>
```

## Root Cause

In n8n's `@n8n/n8n-nodes-langchain.toolCode` nodes, the tool input is NOT available at:
- `$input.item.json.query` ❌
- `$input.item.json` ❌
- `$json.query` ❌
- `$json` ❌

These all return the workflow context, not the tool's input from the AI agent.

## The Solution

Use `$fromAI()` but **without the type parameter**:

```javascript
// WRONG (causes "Cannot assign to read only property 'name'")
const rawInput = $fromAI('query', 'filePath|||fileContent', 'string');

// CORRECT
const rawInput = $fromAI('query');
```

The third parameter ('string') was causing the readonly property error.

## Implementation

All tools should use:
```javascript
const rawInput = $fromAI('query');
// Then parse as string
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();
```

This is how the working tools (create_component, fetch_stock_image) are already implemented in V20.
