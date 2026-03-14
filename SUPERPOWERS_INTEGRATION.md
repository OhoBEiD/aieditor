# Superpowers Integration Guide

This document explains how **Superpowers-style methodology** has been integrated into the AI Editor, bringing disciplined software development practices to the AI-powered coding workflow.

## What is Superpowers?

**Superpowers** is a Claude Code plugin by Jesse Vincent (@obra) that teaches Claude structured software development methodologies through markdown skill files. It enforces disciplined practices like:

- **Test-Driven Development (TDD)**: RED-GREEN-REFACTOR cycles
- **Systematic Debugging**: 4-phase investigation methodology
- **Brainstorming**: Socratic requirement refinement before coding
- **Code Review**: 2-stage quality gates (spec compliance + code quality)

**Key Insight**: Superpowers is "methodology-as-code" — workflows are defined in markdown files that the AI reads and follows as instructions.

## Architecture Overview

### What We Built

Since Superpowers is a Claude Code-specific plugin (VSCode extension), we **adapted the core principles** to work in our web-based Next.js AI Editor:

```
src/lib/ai/
├── skills/
│   ├── loader.ts              # Parse & inject skill files
│   ├── tdd.md                 # Test-Driven Development skill
│   ├── brainstorming.md       # Design-first workflow skill
│   ├── debugging.md           # Systematic debugging skill
│   └── code-review.md         # 2-stage review checklist
└── agents/
    └── CodeReviewAgent.ts     # Automated 2-stage code review
```

### How It Works

1. **Skill Files (.md)**: Markdown files with YAML frontmatter defining:
   - When to activate (category, auto-inject rules)
   - Instructions for the AI to follow

2. **Skill Loader**: Parses skill files, performs string substitution, and injects them into system prompts based on context

3. **Context-Aware Injection**: Skills are automatically added to prompts based on:
   - Task type (simple_edit, complex_feature, debug, refactor)
   - Complexity (simple, moderate, complex)
   - Phase (brainstorming, planning, executing, reviewing)

## Skill Files

### 1. TDD Skill (`tdd.md`)

**Purpose**: Enforce RED-GREEN-REFACTOR test-driven development

**Key Rules**:
- Tests MUST be written before implementation
- Tests MUST fail first (RED), then pass (GREEN), then refactor
- No code without corresponding tests
- Zero tolerance for skipping TDD

**When Injected**:
- Complex features (`complex_feature`)
- Refactoring tasks (`refactor`)

**Example Workflow**:
```typescript
// 1. RED: Write failing test
it('should format currency with 2 decimals', () => {
  expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
});

// 2. GREEN: Write minimal implementation
export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// 3. REFACTOR: Optimize while keeping tests green
const formatters = new Map<string, Intl.NumberFormat>();
export function formatCurrency(amount: number, currency: string) {
  if (!formatters.has(currency)) {
    formatters.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }));
  }
  return formatters.get(currency)!.format(amount);
}
```

### 2. Brainstorming Skill (`brainstorming.md`)

**Purpose**: Socratic requirement refinement before implementation

**Key Rules**:
- No code before design approval
- Ask 5-7 clarifying questions
- Present 2-3 alternative approaches with tradeoffs
- Design document required before proceeding

**When Injected**:
- Planning phase (`phase: "brainstorming"`)
- Interactive proposal generation

**Example Workflow**:
```markdown
User: "I want to add a shopping cart."

Brainstorm:
1. What products will be in the cart? (digital, physical, subscriptions?)
2. Should the cart persist across sessions?
3. What payment providers? (Stripe, PayPal?)
4. Do you need inventory management?
5. What happens when an item is out of stock?

## Approach Options

### Option 1: Use Shopify Buy SDK
- Pros: Fast, feature-rich, maintained
- Cons: Vendor lock-in, less customization

### Option 2: Build Custom (React Context + localStorage)
- Pros: Full control, no dependencies
- Cons: More work, handle edge cases manually

### Option 3: Hybrid (Stripe Checkout + custom UI)
- Pros: Balance of control and speed
- Cons: Integration complexity

[User selects Option 3]

## Design Document
[Components, data model, architecture...]

[User approves design] → Proceed to implementation
```

### 3. Debugging Skill (`debugging.md`)

**Purpose**: Systematic 4-phase debugging methodology

**Key Rules**:
- No fixes before root cause is identified
- INVESTIGATE → ANALYZE → HYPOTHESIZE → FIX
- Three-strike rule: After 3 failed attempts, trigger architectural review
- Every bug fix MUST include a regression test

**When Injected**:
- Debug tasks (`taskType: "debug"`)

**Example Workflow**:
```markdown
## Phase 1: INVESTIGATE
- Define problem: "Submit button doesn't trigger payment API on Safari mobile"
- Reproduce: Navigate to /checkout → Fill form → Click submit → No API call
- Gather evidence: Check console (no errors), network tab (no request), React DevTools

## Phase 2: ANALYZE
Hypothesis: Event handler not firing?
- Add console.log to onClick → Fires correctly
- Check Network tab → No API call
- Inspect handler code → useCallback with empty deps (stale closure!)

ROOT CAUSE: useCallback captures stale formData from initial render

## Phase 3: HYPOTHESIZE
Prediction: Adding formData to deps will fix the issue

## Phase 4: FIX
1. Write failing test exposing the bug
2. Add formData to useCallback dependency array
3. Test passes → Bug fixed
4. Document in commit message
```

### 4. Code Review Skill (`code-review.md`)

**Purpose**: 2-stage quality gate (spec compliance + code quality)

**Key Rules**:
- Stage 1: Verify implementation matches plan/design
- Stage 2: Check code quality (types, errors, performance, security)
- No exceptions — code MUST pass both stages
- Fail fast: Stage 1 fails → Don't proceed to Stage 2

**When Injected**:
- Review phase (`phase: "reviewing"`)
- After task execution (via CodeReviewAgent)

**Example Workflow**:
```markdown
## Stage 1: Spec Compliance
✅ All requirements implemented
✅ File structure matches plan
✅ Tests exist and pass
✅ Verification steps succeed

## Stage 2: Code Quality
✅ Code is readable (clear names, comments)
✅ Types are strict (no `any`)
✅ Errors are handled gracefully
❌ FAIL: Using <img> instead of next/image (best practices violation)
❌ FAIL: No try/catch around fetch call (error handling)

RESULT: NEEDS WORK (2 high-priority issues)
```

## CodeReviewAgent

**Location**: `src/lib/ai/agents/CodeReviewAgent.ts`

**Purpose**: Automated 2-stage code review after task execution

**How It Works**:

1. **Stage 1 Review**: Compare implementation against plan
   - Uses LLM to analyze code vs. plan requirements
   - Checks file structure, test coverage, verification

2. **Stage 2 Review**: Evaluate code quality
   - Loads `code-review.md` skill for checklist
   - Analyzes types, error handling, performance, security, best practices

3. **Return Result**: Pass/fail with detailed feedback

**Usage**:
```typescript
import { runCodeReview } from '@/lib/ai/agents/CodeReviewAgent';

const result = await runCodeReview({
  plan: executionPlan,
  fileOperations: fileOps,
  virtualFS: virtualFileSystem,
});

if (!result.passed) {
  console.log("Review failed:", result.summary);
  result.issues.forEach(issue => {
    console.log(`${issue.severity}: ${issue.issue} (Fix: ${issue.fix})`);
  });
}
```

## Integration Points

### 1. Chat Route (`src/app/api/ai/chat/route.ts`)

**Fast Path**:
```typescript
const fastPathSkills = getSkillsForContext({
  taskType: classification.type,
  complexity: classification.complexity,
  phase: "executing",
});
const systemPromptWithSkills = systemPrompt + fastPathSkills;
```

**Full Pipeline (Task Execution)**:
```typescript
const taskSkills = getSkillsForContext({
  taskType: classification.type,
  complexity: classification.complexity,
  phase: "executing",
});
const taskSystemPrompt = systemPrompt + taskSkills;
```

### 2. Skill Loader (`src/lib/ai/skills/loader.ts`)

**Core Functions**:

- `loadAllSkills()`: Load all .md files from skills directory
- `loadSkill(name)`: Load specific skill by name
- `selectSkills(options)`: Filter skills by category, auto-inject, manual selection
- `getSkillsForContext(context)`: Context-aware skill selection
- `formatSkillsForPrompt(skills)`: Format skills for system prompt injection

**String Substitution**: Supports dynamic variables
```markdown
Session ID: ${CLAUDE_SESSION_ID}
Task Type: $TASK_TYPE
Complexity: $COMPLEXITY
```

## Skill File Format

### YAML Frontmatter
```yaml
---
name: my-skill
description: What this skill does (when to activate)
category: tdd | brainstorming | debugging | code-review | reference
auto-inject: true | false  # Auto-inject for all matching tasks?
allowed-tools: Read, Grep  # Optional: restrict available tools
---
```

### Markdown Content
```markdown
# Skill Title

**CRITICAL**: This skill enforces X. **NO Y** without Z.

## Core Principle
[Mandatory workflow description]

## Hard Rules
- ❌ NEVER do X
- ✅ ALWAYS do Y

## Workflow
[Step-by-step instructions]

## Checklist
- [ ] Step 1
- [ ] Step 2

## Examples
[Code examples demonstrating the skill]
```

## Differences from Superpowers (Claude Code)

| Feature | Superpowers (Claude Code) | Our Integration |
|---------|---------------------------|-----------------|
| **Runtime** | VSCode extension | Web app (Next.js) |
| **Skill Invocation** | Slash commands (`/brainstorming`) | Auto-inject based on context |
| **Skill Format** | SKILL.md with Claude Code hooks | Custom markdown parser |
| **Subagents** | Claude Code Task tool | Parallel `generateText` calls |
| **Code Review** | Manual via subagent | Automated via CodeReviewAgent |
| **TDD Enforcement** | Hard gates in workflow | Skill injection + BuildValidator |
| **Brainstorming** | Interactive with user approval | Interactive proposals artifact |

## Key Advantages

✅ **Methodology as Code**: Workflows are defined in version-controlled markdown files, not buried in prompts

✅ **Context-Aware**: Skills auto-inject based on task type, complexity, and phase

✅ **Composable**: Combine multiple skills for comprehensive guidance

✅ **Maintainable**: Update skills independently without touching system prompts

✅ **Extensible**: Add new skills by creating .md files in `src/lib/ai/skills/`

## Creating New Skills

### Step 1: Create Skill File
```bash
touch src/lib/ai/skills/my-new-skill.md
```

### Step 2: Add Frontmatter + Content
```markdown
---
name: my-new-skill
description: Brief description of when to use this skill
category: reference
auto-inject: true
---

# My New Skill

**Instructions for the AI...**
```

### Step 3: Configure Auto-Injection
Edit `src/lib/ai/skills/loader.ts`:
```typescript
export function getSkillsForContext(context: { ... }): string {
  const skillsToInject: string[] = [];

  // Add your skill based on context
  if (context.taskType === "my_task_type") {
    skillsToInject.push("my-new-skill");
  }

  // ...
}
```

### Step 4: Test
Run the AI editor and verify your skill is injected into system prompts when the condition matches.

## Future Enhancements

### Planned Features
- [ ] TDD enforcement in PlanAgent (inject test tasks before implementation tasks)
- [ ] BuildValidator test file checks (fail if tests missing)
- [ ] Hard gates in InteractiveProposer (block code generation until design approved)
- [ ] Skill versioning (track skill changes over time)
- [ ] Skill analytics (measure impact on code quality)
- [ ] Visual skill editor (UI for creating/editing skills)

### Potential Skills
- [ ] `api-design.md`: RESTful API design principles
- [ ] `accessibility.md`: WCAG 2.1 AA compliance checklist
- [ ] `performance.md`: Web performance optimization guide
- [ ] `security.md`: OWASP Top 10 security practices
- [ ] `documentation.md`: Code documentation standards

## Troubleshooting

### Skills Not Injected
- **Check**: Are skill files in `src/lib/ai/skills/`?
- **Check**: Is frontmatter valid YAML?
- **Check**: Does `getSkillsForContext` include your skill?

### Skills Too Long (Token Limit)
- **Solution**: Split large skills into multiple files
- **Solution**: Use multi-file support (reference docs in subdirectories)
- **Solution**: Reduce skill content (focus on critical rules)

### Skills Not Enforced
- **Remember**: Skills are *guidance*, not *hard gates*
- **Solution**: Add enforcement in BuildValidator or CodeReviewAgent
- **Solution**: Use stronger language ("MUST", "NEVER", "ZERO TOLERANCE")

## Resources

- [Superpowers GitHub](https://github.com/obra/superpowers) — Original Superpowers repository
- [Claude Code Skills Docs](https://code.claude.com/docs/en/skills) — Official Claude Code skills documentation
- [Blog: Superpowers Explained](https://blog.fsck.com/2025/10/09/superpowers/) — Jesse Vincent's blog post

## Contributing

To add new skills or improve existing ones:

1. Create/edit skill files in `src/lib/ai/skills/`
2. Test with various task types and complexities
3. Document your changes in this README
4. Submit a pull request

**Guidelines**:
- Keep skills focused (one methodology per skill)
- Use clear, imperative language ("DO this", "DON'T do that")
- Provide concrete examples (code snippets, workflows)
- Test thoroughly before committing

---

**Built with inspiration from Superpowers by Jesse Vincent (@obra)**
