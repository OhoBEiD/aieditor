---
name: brainstorming
description: Socratic requirement refinement before implementation
category: brainstorming
auto-inject: false
---

# Brainstorming - Think Before You Build

**CRITICAL**: This skill prevents premature implementation. **NO CODE** is written until design is approved.

## Core Principle

**Design → Validate → Implement** is **MANDATORY**. Every complex feature **MUST** go through brainstorming:

1. **Understand**: Ask clarifying questions to understand requirements
2. **Explore**: Research alternatives and tradeoffs
3. **Design**: Present a structured design document
4. **Validate**: Get user approval before writing any code

## Hard Gates (ZERO TOLERANCE)

### Gate 1: No Code Before Design
- ❌ **NEVER** write implementation code during brainstorming
- ❌ **NEVER** skip the design phase for "simple" features (they're never simple)
- ✅ **ALWAYS** present a design document first
- ✅ **ALWAYS** wait for user approval

**If you're writing code, you've failed brainstorming. STOP.**

### Gate 2: Question Everything
- **Don't assume** you understand the requirements
- **Don't guess** what the user wants
- **Ask questions** about edge cases, constraints, and goals
- **Explore alternatives** before committing to an approach

### Gate 3: Design Document Required
Every brainstorming session **MUST** produce a design document with:

1. **Problem Statement**: What are we trying to solve?
2. **Requirements**: What must the solution do? (functional + non-functional)
3. **Approach Options**: 2-3 alternative approaches with pros/cons
4. **Recommendation**: Which approach and why?
5. **Architecture**: High-level structure (components, data flow, dependencies)
6. **Open Questions**: What needs clarification?

**No code until this document is approved.**

## Socratic Questioning Framework

### Phase 1: Clarify the Problem (5-7 Questions)

Ask questions to understand **what** and **why**:

- "What problem are you trying to solve?"
- "Who will use this feature?"
- "What does success look like?"
- "What constraints do we have?" (time, budget, tech stack)
- "What happens if we don't build this?"
- "Are there existing solutions we can use?"
- "What's the minimal version that delivers value?"

**Example**:
```
User: "I want to add a shopping cart."

Brainstorm:
1. What products will be in the cart? (digital, physical, subscriptions?)
2. Should the cart persist across sessions? (guest users, logged-in users?)
3. What payment providers do you want to integrate? (Stripe, PayPal?)
4. Do you need inventory management?
5. What happens when an item is out of stock?
6. Do you need cart abandonment tracking?
7. What's the checkout flow? (single page, multi-step?)
```

### Phase 2: Research Alternatives (Explore 2-3 Options)

Don't commit to the first solution. Explore alternatives:

- **Option A**: Use existing library/service (e.g., Shopify Buy SDK)
  - Pros: Fast, maintained, feature-rich
  - Cons: Less customization, vendor lock-in

- **Option B**: Build custom solution (e.g., React Context + localStorage)
  - Pros: Full control, no dependencies
  - Cons: More work, need to handle edge cases

- **Option C**: Hybrid (e.g., Stripe Checkout + custom cart UI)
  - Pros: Balance of control and speed
  - Cons: Integration complexity

**Present tradeoffs honestly. Let the user choose.**

### Phase 3: Design the Solution

Once an approach is selected, design the architecture:

#### Component Structure
```
src/
├── components/
│   ├── cart/
│   │   ├── CartButton.tsx       # Add to cart CTA
│   │   ├── CartDrawer.tsx       # Slide-out cart panel
│   │   ├── CartItem.tsx         # Single cart item
│   │   └── CartSummary.tsx      # Totals + checkout button
├── lib/
│   ├── cart/
│   │   ├── cartStore.ts         # Zustand store for cart state
│   │   ├── cartActions.ts       # Add/remove/update items
│   │   └── cartPersistence.ts   # localStorage sync
└── app/
    └── api/
        └── checkout/
            └── route.ts         # Stripe checkout session
```

#### Data Model
```typescript
interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  metadata: Record<string, any>; // Size, color, etc.
}

interface Cart {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Key Decisions
- **State management**: Zustand (lightweight, no Provider hell)
- **Persistence**: localStorage (sync to DB on checkout)
- **Payment flow**: Stripe Checkout (secure, PCI-compliant)
- **Edge cases**: Handle item removal during checkout, price changes, stock updates

### Phase 4: Identify Risks & Open Questions

**Risks**:
- Cart data could go stale (product no longer available)
- Race conditions (user opens cart in multiple tabs)
- Price changes after adding to cart

**Mitigations**:
- Validate cart on checkout (server-side)
- Use localStorage events to sync across tabs
- Show price disclaimer: "Prices subject to change"

**Open Questions**:
- Do you want cart analytics? (track abandonment rate)
- Should we support promo codes?
- Multi-currency support?

## Design Document Template

```markdown
# Feature Design: [Feature Name]

## Problem Statement
[What problem are we solving? Why does this matter?]

## Requirements

### Functional
- [ ] User can add items to cart
- [ ] User can remove items from cart
- [ ] Cart persists across page refreshes
- [ ] Cart syncs across browser tabs
- [ ] User can checkout via Stripe

### Non-Functional
- [ ] Cart updates feel instant (<100ms)
- [ ] Works on mobile + desktop
- [ ] Accessible (keyboard navigation, screen readers)
- [ ] Handles errors gracefully (network failures, stock issues)

## Approach Options

### Option 1: [Name]
**Pros**: ...
**Cons**: ...
**Estimated Complexity**: Simple | Moderate | Complex

### Option 2: [Name]
**Pros**: ...
**Cons**: ...
**Estimated Complexity**: Simple | Moderate | Complex

## Recommendation
[Which option and why? What tradeoffs are we accepting?]

## Architecture

### Component Structure
[File tree + responsibilities]

### Data Model
[Types, schemas, database tables]

### Key Technical Decisions
- State management: [Choice + rationale]
- Persistence: [Choice + rationale]
- Payment: [Choice + rationale]

## Implementation Plan (High-Level)
1. Set up cart state (Zustand store)
2. Build cart UI components
3. Implement persistence (localStorage)
4. Integrate Stripe checkout
5. Add error handling + validation
6. Write tests (TDD)

## Risks & Mitigations
[What could go wrong? How do we prevent it?]

## Open Questions
[What needs clarification before we start?]
```

## Integration with This Project

### When Brainstorming Triggers
- **Always** for `complex_feature` tasks (e.g., "Build a landing page", "Add authentication")
- **Always** for `moderate` tasks with unclear requirements
- **Optional** for `simple_edit` tasks (skip for "change color to blue")

### Output Format
- **Interactive Proposals**: Present 2-3 approach options with pros/cons
- **User Selection**: Wait for user to choose Option 1, 2, or 3
- **Proceed**: Only after user approves the design

### Hard Gate Enforcement
**Code Review Agent** will flag any implementation that:
- Doesn't match the approved design
- Adds features not in the design document
- Skips the brainstorming phase entirely

## Brainstorming Anti-Patterns (AVOID)

❌ **Assuming Requirements**: "I'll build a shopping cart with X, Y, Z features"
✅ **Asking Questions**: "What features do you need in the cart?"

❌ **One Option**: "Here's my solution"
✅ **Multiple Options**: "Here are 3 approaches with tradeoffs"

❌ **Jumping to Code**: "I'll start by creating CartButton.tsx..."
✅ **Design First**: "Let me design the architecture first"

❌ **Ignoring Edge Cases**: "This should work for most cases"
✅ **Planning for Edge Cases**: "What happens when the item is out of stock?"

## Remember

> "Weeks of programming can save hours of planning." — Unknown

**Brainstorming is not a waste of time. It's the most important time.**

## Checklist Before Proceeding

- [ ] Have I asked clarifying questions?
- [ ] Have I explored 2-3 alternative approaches?
- [ ] Have I presented pros/cons for each option?
- [ ] Have I documented the architecture?
- [ ] Have I identified risks and edge cases?
- [ ] Has the user **approved** the design?

**If any answer is NO, you're not done brainstorming.**
