# How to Fix Your n8n Workflow

## The Problem
The AI is changing metadata (page titles in `<title>` tags) instead of visible content (the actual `<h1>` heading text users see).

## The Solution
I've updated your workflow with an improved AI prompt that tells it to change VISIBLE content.

## Steps to Apply the Fix

### 1. Import the Updated Workflow

**Option A: Via n8n UI (Recommended)**
1. Open your n8n workflow in the browser
2. Click the **"..."** menu (top right) → **"Import from File"**
3. Select: `fly-edit-ui-workflow-v4-UPDATED.json`
4. Click **"Save"** (bottom right)
5. The workflow will reload with the updated prompt

**Option B: Replace the system message manually**
1. Open your n8n workflow
2. Click on the **"AI Plan"** node
3. In the right panel, go to **"Options"** section
4. Find **"System Message"** field
5. Replace it with the content from `improved-system-prompt.txt`
6. Click **"Save"**

### 2. Test the Fix

After importing:
1. Go back to your app at `localhost:3000`
2. Type: **"change the large heading that says 'Demo Site' to say 'Obeid Store'"**
3. Send the message
4. The preview should now update and show "Obeid Store" instead of "Demo Site"

### 3. If It Still Doesn't Work

The only other reason would be if the AI isn't generating the unified diff properly. To check:

1. In n8n, look at your latest workflow execution
2. Find the "Response" node output
3. Expand `plan_json` → look for `unifiedDiff`
4. If it's empty or missing, DM me the execution details

## What Changed

The new prompt adds this critical section:

```
## CRITICAL: Make VISIBLE Changes
When users ask to change text, colors, layout, or any visual element:
- Change the ACTUAL RENDERED CONTENT (h1, p, div text, etc.)
- NOT just metadata (document.title, meta tags)
- Focus on what users SEE in the browser
- Example: "change title to Obeid Store" means change the <h1> text, NOT the <title> tag
```

This tells the AI to:
- Change visible `<h1>` text, not page metadata
- Generate proper unified diffs
- Focus on what users actually see

That's it! Import the updated workflow and test again.
