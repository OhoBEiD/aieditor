# Quick Start: AI Agent with Tools

## TL;DR - What You're Building

Transform your AI from **"blind guesser"** to **"autonomous code explorer"** by giving it 3 tools:

1. **search_code** - Find patterns across all files (like `grep -r`)
2. **read_file** - Read any file's contents (like `cat`)
3. **list_files** - Find files by pattern (like `find`)

---

## The Transformation

### BEFORE (Current Setup)
```
User: "change colors to orange"
   ↓
AI sees: page.tsx, layout.tsx (only these 2 files!)
   ↓
AI generates: diff for page.tsx only
   ↓
Result: ⚠️ "Additional changes may be in globals.css" (AI guessing!)
```

### AFTER (AI Agent with Tools)
```
User: "change colors to orange"
   ↓
AI calls: search_code("cyan")
   ↓
Tool returns: Found in page.tsx, globals.css, Hero.tsx
   ↓
AI calls: read_file("src/app/globals.css")
AI calls: read_file("src/components/Hero.tsx")
   ↓
AI analyzes all files
   ↓
AI generates: complete diffs for page.tsx, globals.css, Hero.tsx
   ↓
Result: ✅ All color changes applied perfectly!
```

---

## Setup in 5 Steps

### Step 1: Replace AI Plan Node (5 min)

1. Open your workflow in n8n
2. **Delete** the "AI Plan" node
3. **Add** new node: **"AI Agent"** (under AI category)
4. Paste the system prompt from `/n8n/AI-AGENT-WORKFLOW-GUIDE.md` Step 2

### Step 2: Add search_code Tool (10 min)

**Quick Copy-Paste:**

1. Add **"Code Tool"** node connected to AI Agent
2. Set name: `search_code`
3. Paste schema from `/n8n/tools/search-code-tool.json`
4. Add **"Code"** node after it
5. Paste code from `/n8n/tool-handlers/search-code-handler.js`
6. Add **"HTTP Request"** node:
   ```
   URL: https://api.github.com/search/code
   Method: GET
   Headers: Authorization = Bearer YOUR_GITHUB_TOKEN
   ```
7. Add final **"Code"** node to format response (see guide)

### Step 3: Add read_file Tool (10 min)

Same process, use files:
- Schema: `/n8n/tools/read-file-tool.json`
- Handler: `/n8n/tool-handlers/read-file-handler.js`

### Step 4: Add list_files Tool (10 min)

Same process, use files:
- Schema: `/n8n/tools/list-files-tool.json`
- Handler: `/n8n/tool-handlers/list-files-handler.js`

### Step 5: Update Parse Plan (2 min)

The AI Agent returns output differently. Update your Parse Plan node code (see guide Step 5).

---

## Visual Architecture

```
┌─────────────────────────────────────────────────────────┐
│  USER: "change colors to orange"                        │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Build Context (loads initial files)                    │
│  - page.tsx                                             │
│  - layout.tsx                                           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  AI AGENT (with tools)                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Thinks: "Need to find all color references"     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Calls Tool: search_code("cyan")                        │
│       ↓                                                  │
│  [search_code handler] → GitHub API → Returns matches   │
│       ↓                                                  │
│  Result: Found in globals.css, page.tsx, Hero.tsx       │
│                                                          │
│  Calls Tool: read_file("src/app/globals.css")          │
│       ↓                                                  │
│  [read_file handler] → GitHub API → Returns content     │
│       ↓                                                  │
│  Result: Full CSS with gradient definitions             │
│                                                          │
│  Calls Tool: read_file("src/components/Hero.tsx")      │
│       ↓                                                  │
│  [read_file handler] → GitHub API → Returns content     │
│       ↓                                                  │
│  Result: Component code with cyan classes               │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Analyzes: All 3 files need orange colors        │   │
│  │ Generates: Complete unified diffs for all 3     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Parse Plan (extracts JSON)                             │
│  {                                                       │
│    fileTargets: [                                       │
│      "src/app/page.tsx",                                │
│      "src/app/globals.css",                             │
│      "src/components/Hero.tsx"                          │
│    ],                                                    │
│    unifiedDiff: "...complete diffs for all 3..."       │
│  }                                                       │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Fly Apply Diff (applies all changes)                   │
│  ✅ page.tsx updated                                     │
│  ✅ globals.css updated                                  │
│  ✅ Hero.tsx updated                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  USER SEES: All colors changed to orange! 🎉            │
└─────────────────────────────────────────────────────────┘
```

---

## Test Cases

After setup, test with these:

### Test 1: Simple (verify tools work)
```
"change heading to 'Welcome'"
```
Expected: AI searches for heading, reads page.tsx, generates diff

### Test 2: Complex (the real test!)
```
"change all colors from cyan/purple to orange"
```
Expected: AI searches for cyan/purple, finds globals.css + page.tsx, reads both, generates diffs for both

### Test 3: Layout Change
```
"add a new section below the hero with 3 cards"
```
Expected: AI reads page.tsx, understands structure, generates diff with new section

---

## Files You Need

All created and ready:

```
/n8n/
├── tools/
│   ├── search-code-tool.json        ← Tool schema
│   ├── read-file-tool.json          ← Tool schema
│   └── list-files-tool.json         ← Tool schema
├── tool-handlers/
│   ├── search-code-handler.js       ← Tool implementation
│   ├── read-file-handler.js         ← Tool implementation
│   └── list-files-handler.js        ← Tool implementation
├── AI-AGENT-WORKFLOW-GUIDE.md       ← Complete setup guide
├── AGENTIC-SYSTEM-PROMPT.txt        ← System prompt for AI
└── QUICK-START.md                   ← This file
```

---

## Common Issues

**"AI not calling tools"**
→ Check: System prompt is set and mentions tools

**"Tools returning errors"**
→ Check: GitHub token is valid and has repo access

**"AI calling tools but still incomplete diffs"**
→ Check: System prompt emphasizes "generate diffs for ALL files found"

---

## What Happens Now

Once setup, every user request will trigger:

1. **🔍 Search Phase** - AI finds all relevant files
2. **📖 Read Phase** - AI reads discovered files
3. **🧠 Analysis Phase** - AI understands full context
4. **✏️ Generation Phase** - AI creates complete diffs

**Just like Cursor. No more guessing. No more warnings. Just complete, accurate code changes.** 🚀

Ready to set this up? Follow the **AI-AGENT-WORKFLOW-GUIDE.md** step by step!
