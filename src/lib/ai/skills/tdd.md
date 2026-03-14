---
name: tdd
description: Enforce RED-GREEN-REFACTOR test-driven development workflow
category: tdd
auto-inject: true
---

# Test-Driven Development (TDD) - RED-GREEN-REFACTOR

**CRITICAL**: This skill enforces disciplined TDD practices. **NO CODE** is written before tests exist.

## Core Principle

**RED → GREEN → REFACTOR** is **MANDATORY**. Every feature, bug fix, and refactor **MUST** follow this cycle:

1. **RED**: Write a failing test first
2. **GREEN**: Write minimal code to make it pass
3. **REFACTOR**: Clean up while keeping tests green

## Hard Rules (ZERO TOLERANCE FOR VIOLATIONS)

### Rule 1: Tests Come First
- ❌ **NEVER** write implementation code before writing a test
- ❌ **NEVER** write code without a corresponding test
- ✅ **ALWAYS** write the test first, run it, watch it fail
- ✅ **ALWAYS** verify the test fails for the right reason

**If you're about to write production code, STOP. Where's the failing test?**

### Rule 2: Test Must Fail First (RED)
- Write a test that describes the desired behavior
- Run the test and **verify it fails**
- If the test passes immediately, the test is **wrong** or **unnecessary**
- RED means: "I don't have this feature yet, and my test proves it"

### Rule 3: Write Minimal Code to Pass (GREEN)
- Write **only enough code** to make the failing test pass
- **YAGNI** (You Aren't Gonna Need It): Don't add features not covered by tests
- Run the test and **verify it passes**
- GREEN means: "The feature works, and my test proves it"

### Rule 4: Refactor Only with Green Tests
- **Only refactor when all tests are green**
- If a test is red during refactoring, **stop immediately** and fix it
- Refactoring changes **structure**, not **behavior**
- Run tests frequently during refactoring

### Rule 5: Test File Naming Convention
- Component: `Button.tsx` → Test: `Button.test.tsx` or `Button.spec.tsx`
- Utility: `formatDate.ts` → Test: `formatDate.test.ts`
- API Route: `route.ts` → Test: `route.test.ts`
- Place tests in `__tests__` directory or colocated with source

## Workflow for New Features

### Step 1: Write Test (RED Phase)
```typescript
// Example: Adding a "formatCurrency" function

// formatCurrency.test.ts
import { formatCurrency } from './formatCurrency';

describe('formatCurrency', () => {
  it('should format USD currency with 2 decimals', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  it('should handle zero values', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});
```

**Action**: Run test → Verify it **FAILS** (function doesn't exist yet)

### Step 2: Write Minimal Implementation (GREEN Phase)
```typescript
// formatCurrency.ts
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}
```

**Action**: Run test → Verify it **PASSES**

### Step 3: Refactor (Keep GREEN)
```typescript
// formatCurrency.ts (refactored)
const formatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(amount: number, currency: string): string {
  if (!formatters.has(currency)) {
    formatters.set(currency, new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }));
  }
  return formatters.get(currency)!.format(amount);
}
```

**Action**: Run test → Verify it **STILL PASSES**

## Workflow for Bug Fixes

### Step 1: Write Test That Reproduces Bug (RED)
```typescript
it('should handle negative values correctly', () => {
  // This test exposes the bug
  expect(formatCurrency(-100, 'USD')).toBe('-$100.00');
});
```

**Action**: Run test → Verify it **FAILS** (bug exists)

### Step 2: Fix Bug (GREEN)
```typescript
// (implementation already handles negatives via Intl.NumberFormat)
```

**Action**: Run test → Verify it **PASSES** (bug fixed)

### Step 3: Verify All Tests Still Pass
**Action**: Run full test suite → Verify **ALL GREEN**

## Integration with This Project

### Frontend Components (Next.js + React)
- Use **Jest** + **React Testing Library** for component tests
- Test user interactions, not implementation details
- Mock API calls with `msw` (Mock Service Worker)

### Backend/API Routes
- Use **Jest** for unit tests
- Use **supertest** for API integration tests
- Mock database calls with `jest.fn()` or test databases

### Example: Testing a React Component
```typescript
// Button.test.tsx (RED)
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

```typescript
// Button.tsx (GREEN)
export function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
```

## Test Coverage Requirements

- **Critical paths**: 100% coverage (auth, payments, data mutations)
- **UI components**: 80% coverage (happy path + edge cases)
- **Utilities**: 90% coverage (all branches)
- **Integration tests**: Key user flows (signup, checkout, etc.)

## When to Skip TDD (Rare Exceptions)

**TDD is mandatory for:**
- New features
- Bug fixes
- Refactoring existing code

**TDD can be relaxed for:**
- Quick prototypes/spikes (but delete after demo)
- Generated code (migrations, boilerplate)
- **HOWEVER**: If prototype becomes production, **write tests immediately**

## Enforcement Mechanism

**This skill includes automatic enforcement:**

1. **Build Validator**: Checks for test files matching implementation files
2. **Plan Agent**: Injects "write test" tasks before "write implementation" tasks
3. **Code Review Agent**: Flags commits without tests as **FAILED REVIEW**

**If you write code without tests, the pipeline WILL block you.**

## RED-GREEN-REFACTOR Checklist

Before writing any code, ask yourself:

- [ ] Have I written a test that describes the desired behavior?
- [ ] Did I run the test and see it **fail**?
- [ ] Did I write **only enough code** to make the test pass?
- [ ] Did I run the test and see it **pass**?
- [ ] Are all other tests **still passing**?
- [ ] Have I refactored while keeping tests green?

**If any answer is NO, you've broken TDD. Stop and fix it.**

## Remember

> "Code without tests is broken by design." — Jacob Kaplan-Moss

**TDD is not optional. It's the foundation of reliable software.**
