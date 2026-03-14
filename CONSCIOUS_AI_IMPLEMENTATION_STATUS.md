# Conscious Multi-Agent System - Implementation Status

## ✅ Phase 1: Requirement Gathering (COMPLETED)

### Created Files

#### 1. RequirementGatheringAgent.ts
**Location**: `src/lib/ai/agents/RequirementGatheringAgent.ts`

**Features**:
- Analyzes user requests for missing critical information
- Generates 3-5 smart, contextual questions
- Supports multiple question types: text, textarea, select, multi-select, radio
- Returns `shouldGather: false` if request is already complete
- Builds enriched prompts from user answers

**Task Type Detection**:
- Ecommerce: Asks about brand name, products, color theme, features
- Landing Page: Asks about company name, description, audience, CTA
- Dashboard: Asks about app name, data types, user roles
- Portfolio: Asks about name, profession, project types, style
- Blog: Asks about blog name, topics, author

**Key Functions**:
```typescript
runRequirementGatheringAgent(userRequest): Promise<RequirementGatheringResult>
buildEnrichedPrompt(originalRequest, userAnswers, taskType): string
shouldGatherRequirements(message, classification): boolean
```

#### 2. RequirementForm.tsx
**Location**: `src/components/chat/RequirementForm.tsx`

**Features**:
- Multi-step wizard (Question 1 of 5)
- Progress indicator with animated dots
- Support for all question types (text, textarea, select, multi-select)
- Validation for required fields
- Skip button for optional questions
- Keyboard navigation (Enter to advance)
- Help tooltips for complex questions

**UI/UX**:
- Dark glass aesthetic matching ProposalSelector
- Bronze/gold accent colors (#b69161, #c9a474)
- Smooth transitions between steps
- Back button for navigation
- "Start Building" CTA on final question

#### 3. Artifact Types & Emitter
**Modified**: `src/lib/ai/artifacts/types.ts`
**Modified**: `src/lib/ai/artifacts/emitter.ts`

**Added**:
- `requirement_form` artifact type
- `RequirementFormData` interface
- `emitRequirementFormArtifact()` function

#### 4. MessageBubble Integration
**Modified**: `src/components/chat/MessageBubble.tsx`

**Changes**:
- Import RequirementForm component
- Parse `requirement_form` artifacts
- Render RequirementForm when detected
- Submit answers as `REQUIREMENT_ANSWERS:` formatted message

---

## 🔄 Phase 2: Integration (IN PROGRESS)

### Next Steps

#### Step 1: Integrate into Chat Route
**File**: `src/app/api/ai/chat/route.ts`

**Changes Needed**:
```typescript
import {
  runRequirementGatheringAgent,
  shouldGatherRequirements,
  buildEnrichedPrompt
} from '@/lib/ai/agents/RequirementGatheringAgent';
import { emitRequirementFormArtifact } from '@/lib/ai/artifacts/emitter';

// After classification, check if requirements needed
if (shouldGatherRequirements(message, classification)) {
  await emitStep(requestId, siteId, stepCounter++, "gathering", "active", "Analyzing requirements...", undefined, sessionId);

  const requirements = await runRequirementGatheringAgent(message);

  if (requirements.shouldGather) {
    // Emit requirement form artifact
    emitRequirementFormArtifact(
      writer,
      requirements.questions,
      requirements.detectedTaskType,
      requirements.missingInfo
    );

    await emitStep(requestId, siteId, stepCounter++, "gathering", "complete", `${requirements.questions.length} questions prepared`, undefined, sessionId);

    // End stream and wait for user answers
    writeDoneMarker(writer, 0);
    writer.write({ type: "finish", finishReason: "stop" });
    return;
  }
}

// Detect if message is requirement answers submission
const isRequirementSubmission = message.startsWith('REQUIREMENT_ANSWERS:');

if (isRequirementSubmission) {
  // Parse answers
  const answersText = message.replace('REQUIREMENT_ANSWERS:\n', '');
  const userAnswers: Record<string, any> = {};

  answersText.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    // Handle multi-select (comma-separated)
    if (value.includes(',')) {
      userAnswers[key.trim()] = value.split(',').map(v => v.trim());
    } else {
      userAnswers[key.trim()] = value;
    }
  });

  // Get original request from conversation history
  const originalRequest = authHistory.find(m => m.role === 'user')?.content || message;

  // Build enriched request
  const enrichedRequest = buildEnrichedPrompt(
    originalRequest,
    userAnswers,
    // Get task type from previous requirement form (would need to store this)
    'ecommerce' // TODO: retrieve from session context
  );

  // Replace message with enriched version
  message = enrichedRequest;

  // Continue with normal flow (Explore → Propose → Plan → Execute)
}
```

**Integration Points**:
1. After classification (line ~470)
2. Before ExploreAgent (line ~780)
3. Parse requirement answers before re-classification

---

## 🚀 Phase 3: Enhanced InteractiveProposer (TODO)

### Changes Needed
**File**: `src/lib/ai/agents/InteractiveProposer.ts`

**New Function**:
```typescript
export async function generateProposalsWithContext(
  userRequest: string,
  userAnswers: Record<string, any>, // From RequirementForm
  exploration: ExplorationResult | null,
  brainEntries: BrainEntry[],
): Promise<ProposalResult> {
  // Build enriched prompt from answers
  const enrichedPrompt = `${userRequest}\n\nUser-specified details:\n`;

  // Add brand name to prompt
  if (userAnswers.brand_name || userAnswers.company_name) {
    enrichedPrompt += `- Brand: "${userAnswers.brand_name || userAnswers.company_name}"\n`;
  }

  // Add color theme
  if (userAnswers.color_theme) {
    enrichedPrompt += `- Color Theme: ${userAnswers.color_theme}\n`;
  }

  // ... etc for all answers

  // Pass enriched prompt to generateProposals
  return generateProposals(enrichedPrompt, exploration, virtualFS, brainEntries);
}
```

**Enhanced System Prompt**:
```
## USER-SPECIFIED DETAILS (CRITICAL - USE THESE EXACTLY)
If the user has provided specific details (brand name, colors, features), you MUST use them verbatim in ALL 3 proposals.

Example:
User specified: Brand "Furry Furniture", Dark & Premium theme
→ All 3 options must say: "for Furry Furniture with dark premium aesthetic"

NEVER invent alternative brand names when the user has specified one.
```

---

## 🎯 Phase 4: Add Custom Option to ProposalSelector (TODO)

### Changes Needed
**File**: `src/components/chat/ProposalSelector.tsx`

**Add 4th Option**:
```typescript
// After the 3 generated options, add:
{
  id: 4,
  title: "Custom Approach",
  description: "Describe your own vision beyond these options",
  type: "custom", // New field
  // ... other fields
}
```

**Custom Input UI**:
```tsx
{option.type === 'custom' && isExpanded && (
  <div className="px-4 pb-4 pl-12">
    <textarea
      value={customInput}
      onChange={(e) => setCustomInput(e.target.value)}
      placeholder="Describe what you want to build... (e.g., 'I want a 3D product viewer with dark theme and gold accents')"
      rows={4}
      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-[#b69161]/30 text-sm text-white/95 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#c9a474]/40"
    />
    <button
      onClick={() => onSelect(4, customInput)}
      className="mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#b69161] to-[#c9a474] text-white text-sm font-semibold"
    >
      Submit Custom Approach
    </button>
  </div>
)}
```

**Update onSelect** to accept optional custom text:
```typescript
onSelect={(id, customText?: string) => {
  if (id === 4 && customText) {
    // Send custom approach
    onSendMessage?.(`CUSTOM_APPROACH: ${customText}`);
  } else {
    // Normal option selection
    onSendMessage?.(`Option ${id}`);
  }
}}
```

---

## ⚡ Phase 5: Optimize ExploreAgent (TODO)

### Changes Needed
**File**: `src/lib/ai/agents/ExploreAgent.ts`

**Token Optimizations**:

1. **Smarter File Reading** (use line ranges):
```typescript
// Instead of read_file({path: "src/app/page.tsx"})
// Use: read_file({path: "src/app/page.tsx", startLine: 1, endLine: 50})

// Add to system prompt:
"Use read_file with startLine/endLine to read only relevant sections.
For components: Read first 30 lines (imports + signature).
For configs: Read entire file (usually <50 lines).
For large files: Use grep_files to find exact lines first, then read those ranges."
```

2. **Caching** (store exploration results):
```typescript
const explorationCache = new Map<string, ExplorationResult>();

export async function runExploreAgent(
  userRequest: string,
  virtualFS: Map<string, string>,
  // ...
): Promise<ExplorationResult> {
  // Generate cache key from file list
  const fileListHash = Array.from(virtualFS.keys()).sort().join('|');
  const cacheKey = `${fileListHash}_${userRequest}`;

  if (explorationCache.has(cacheKey)) {
    console.log('[ExploreAgent] Cache hit');
    return explorationCache.get(cacheKey)!;
  }

  // ... run exploration as normal

  explorationCache.set(cacheKey, result);
  return result;
}
```

3. **Compression** (reduce output):
```typescript
// Current: Returns 5000 char summary
// Target: Returns 2000 char summary

// Compress file paths:
// Before: "src/components/ui/button.tsx, src/components/ui/input.tsx, ..."
// After: "src/components/ui/{button,input}.tsx"

// Compress patterns:
// Before: "Components use React.forwardRef for ref forwarding"
// After: "forwardRef used"
```

**Expected Savings**:
- Before: ~50k tokens for exploration
- After: ~10k tokens (5x reduction)

---

## 📊 Phase 6: Post-Generation Feedback Loop (TODO)

### New Agent: FeedbackAgent
**File**: `src/lib/ai/agents/FeedbackAgent.ts` (to be created)

**Purpose**: After execution completes, ask user for feedback and refine

**Workflow**:
```
AI: [Generates ecommerce site]
AI: "Does this match your vision?"
  [Perfect!] [Needs tweaks] [Start over]

User: [Clicks "Needs tweaks"]
AI: "What should I change?"
  [Text input: "Make the hero section darker and add a video background"]

FeedbackAgent: Analyzes feedback → Creates targeted fix plan
  → Executes only the changes needed
  → Asks again: "Better?"
```

**Implementation**:
```typescript
export async function runFeedbackAgent(
  userFeedback: string,
  currentImplementation: FileOperation[],
  originalPlan: ExecutionPlan,
): Promise<ExecutionPlan> {
  // Analyze what needs to change
  // Generate minimal fix plan
  // Return plan for execution
}
```

**UI Component**:
**File**: `src/components/chat/FeedbackPrompt.tsx` (to be created)

```tsx
<div className="my-3 rounded-2xl dark-glass-subtle p-4">
  <p className="text-sm text-white/90 mb-3">Does this match your vision?</p>
  <div className="flex gap-2">
    <button onClick={() => onFeedback('perfect')} className="...">
      ✅ Perfect!
    </button>
    <button onClick={() => onFeedback('needs_tweaks')} className="...">
      🔧 Needs tweaks
    </button>
    <button onClick={() => onFeedback('start_over')} className="...">
      🔄 Start over
    </button>
  </div>

  {feedbackMode === 'needs_tweaks' && (
    <textarea
      placeholder="What should I change?"
      className="..."
      onSubmit={(text) => onSendMessage(`FEEDBACK: ${text}`)}
    />
  )}
</div>
```

---

## 📝 Complete Integration Flow

### Before (Current)
```
User: "build me an ecom web"
  ↓
Classify → Explore → Propose (generic 3 options) → User selects → Plan → Execute
```

### After (Target)
```
User: "build me an ecom furniture store"
  ↓
Classify
  ↓
RequirementGathering: "I have 5 questions..."
  ↓
User answers:
  - Brand: "Furry Furniture"
  - Products: "Living Room, Bedroom furniture"
  - Theme: "Dark & Premium"
  - Style: "Luxury/High-End"
  - Features: "Cart, Filters, Wishlist"
  ↓
Enriched Request: "Build ecommerce for Furry Furniture selling Living/Bedroom furniture, dark premium luxury theme, with cart, filters, wishlist"
  ↓
Explore (optimized, cached)
  ↓
Propose (3 contextual options + 1 custom):
  1. Quick MVP for Furry (dark luxury, basic cart)
  2. Standard Furry Store (all features, 5 pages)
  3. Premium Furry Experience (3D, animations, full luxury)
  4. Custom: [User describes]
  ↓
User selects → Plan (uses brand "Furry", dark colors, luxury fonts) → Execute
  ↓
Feedback: "Does this match your vision?"
  ↓
User: "Needs tweaks - make hero darker"
  ↓
FeedbackAgent → Targeted fix → Execute fix → Ask again
```

---

## 🎯 Success Metrics (Target)

| Metric | Before | After Target |
|--------|--------|--------------|
| **Proposal Variety** | 10% (same 3 templates) | 80%+ unique proposals |
| **Brand Accuracy** | 40% (invents names) | 100% uses user's name |
| **Token Efficiency** | 100k tokens/request | 50-60k tokens (40% savings) |
| **User Satisfaction** | "AI guessed wrong" | "AI understood me" |
| **Iterations to Success** | 3-5 back-and-forth | 1-2 with feedback loop |

---

## 🔧 Testing Checklist

### Requirement Gathering
- [ ] Test ecommerce request (brand, products, theme)
- [ ] Test landing page request (company, description, audience)
- [ ] Test with already-complete request (should skip gathering)
- [ ] Test form validation (required fields)
- [ ] Test multi-select answers
- [ ] Test skip button for optional questions

### Enriched Proposals
- [ ] Verify brand name appears in all 3 proposals
- [ ] Verify color theme is referenced
- [ ] Verify proposals are contextually different
- [ ] Test custom option input
- [ ] Verify custom text is sent to AI

### Token Optimization
- [ ] Measure token usage before/after
- [ ] Verify exploration cache works
- [ ] Check line-range reading vs full file reads

### End-to-End
- [ ] "build me an ecom web" → Questions → Answers → Proposals → Build
- [ ] Verify final output uses user's exact brand name
- [ ] Verify colors match user's theme selection
- [ ] Test feedback loop (needs tweaks → targeted fix)

---

## 📦 Files Summary

### ✅ Created
1. `src/lib/ai/agents/RequirementGatheringAgent.ts` (353 lines)
2. `src/components/chat/RequirementForm.tsx` (289 lines)

### ✅ Modified
3. `src/lib/ai/artifacts/types.ts` (added requirement_form type)
4. `src/lib/ai/artifacts/emitter.ts` (added emitRequirementFormArtifact)
5. `src/components/chat/MessageBubble.tsx` (integrated RequirementForm rendering)

### 🔜 To Modify
6. `src/app/api/ai/chat/route.ts` (integrate requirement gathering flow)
7. `src/lib/ai/agents/InteractiveProposer.ts` (add generateProposalsWithContext)
8. `src/lib/ai/agents/ExploreAgent.ts` (add caching + optimization)
9. `src/components/chat/ProposalSelector.tsx` (add 4th custom option)

### 🔜 To Create
10. `src/lib/ai/agents/FeedbackAgent.ts` (post-generation refinement)
11. `src/components/chat/FeedbackPrompt.tsx` (feedback UI)

---

## 🚀 Deployment Strategy

### Phase 1: MVP (Requirement Gathering Only)
**Deploy**: RequirementGathering + RequirementForm + Chat integration
**Test**: User flow from question → answers → enriched prompt
**Rollout**: 10% users (A/B test)

### Phase 2: Enhanced Proposals
**Deploy**: generateProposalsWithContext + brand name enforcement
**Test**: Verify proposals use user's answers
**Rollout**: 50% users

### Phase 3: Custom Option + Optimization
**Deploy**: Custom proposal option + ExploreAgent caching
**Test**: Token reduction metrics + custom input flow
**Rollout**: 100% users

### Phase 4: Feedback Loop
**Deploy**: FeedbackAgent + FeedbackPrompt
**Test**: Iterative refinement flow
**Rollout**: 100% users

---

## 🎨 Future Enhancements

### Advanced Question Types
- Color picker for theme selection
- Image upload for style reference
- Component gallery for UI pattern selection

### Smart Question Generation
- Learn from past conversations (Brain integration)
- Adaptive questions based on user's skill level
- Conditional questions (if answer X, ask Y)

### Contextual Proposals
- Use Brain to remember user's preferences
- Propose based on project history
- Learn from past selections (user likes Option 3)

### Feedback Analytics
- Track which proposals users select most
- Measure satisfaction per task type
- A/B test question phrasing

---

**Status**: Phase 1 complete (UI + Agent), Phase 2 in progress (integration into chat flow)
**Next Action**: Integrate requirement gathering into chat route (`src/app/api/ai/chat/route.ts`)
