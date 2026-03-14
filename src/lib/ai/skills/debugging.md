---
name: debugging
description: Systematic 4-phase debugging methodology - investigate before fixing
category: debugging
auto-inject: false
---

# Systematic Debugging - Investigate, Don't Guess

**CRITICAL**: This skill prevents random fixes and broken code. **NO FIXES** are applied until root cause is found.

## Core Principle

**Investigate → Analyze → Hypothesize → Fix** is **MANDATORY**. Every bug **MUST** go through 4 phases:

1. **INVESTIGATE**: Gather evidence (logs, code, reproduction steps)
2. **ANALYZE**: Identify patterns and narrow down root cause
3. **HYPOTHESIZE**: Form a theory and test it
4. **FIX**: Implement targeted fix with verification

## Hard Rules (ZERO TOLERANCE FOR GUESSING)

### Rule 1: No Fixes Before Root Cause
- ❌ **NEVER** apply random fixes hoping they work
- ❌ **NEVER** skip investigation to "try something quickly"
- ✅ **ALWAYS** understand **WHY** the bug exists before fixing
- ✅ **ALWAYS** have evidence supporting your hypothesis

**If you can't explain why the bug happens, you don't understand it.**

### Rule 2: Three-Strike Rule (Escalate After 3 Failures)
- **Strike 1**: First fix attempt fails → Re-investigate
- **Strike 2**: Second fix attempt fails → Broader analysis required
- **Strike 3**: Third fix attempt fails → **STOP** and trigger architectural review

**After 3 failed attempts, the problem is systemic, not tactical.**

### Rule 3: Reproduce First, Fix Second
- **Always** reproduce the bug reliably before attempting to fix
- **Write a failing test** that exposes the bug (TDD)
- **Fix is done** when test passes and bug is no longer reproducible

### Rule 4: Regression Prevention
- **Every bug fix MUST** include a test that prevents regression
- **Run full test suite** after fix to ensure nothing else broke
- **Document the bug** and fix in commit message

## Phase 1: INVESTIGATE (Gather Evidence)

**Goal**: Collect all relevant information about the bug

### Step 1.1: Define the Problem Clearly
- **What** is broken? (specific behavior, not vague "it doesn't work")
- **When** does it happen? (always, sometimes, specific conditions?)
- **Where** does it happen? (which file, component, function, line?)
- **Who** is affected? (all users, specific browsers, edge cases?)

**Example**:
```
❌ Vague: "The button doesn't work"
✅ Specific: "The 'Submit' button in the checkout form doesn't trigger
   the payment API when clicked on Safari mobile (iOS 16+)"
```

### Step 1.2: Reproduce the Bug
- **Create minimal reproduction** (simplest case that triggers bug)
- **Document exact steps** to reproduce
- **Verify reproduction** multiple times (not a fluke)

**Example Steps**:
```
1. Navigate to /checkout
2. Add 3 items to cart
3. Fill out payment form (valid card: 4242 4242 4242 4242)
4. Click "Submit Payment" button
5. EXPECTED: Payment processes, redirect to /success
6. ACTUAL: Nothing happens, no API call, no error message
```

### Step 1.3: Gather Evidence (Use Tools)
- **Console logs**: Check browser console for errors/warnings
- **Network tab**: Inspect API calls (sent? response? status code?)
- **React DevTools**: Check component state/props
- **Debugger**: Set breakpoints in suspected code
- **Error tracking**: Check Sentry/LogRocket for stack traces

**Critical Tools**:
- `console.log()` for state inspection
- `debugger;` for breakpoints
- `grep_files` to search for error messages in code
- `read_file` to read suspected files

**Action**: Use `grep_files` to search for error messages, function names, or related code

### Step 1.4: Check Recent Changes
- **What changed recently?** (git log, PRs merged)
- **Did this work before?** (regression vs. new bug)
- **What's different now?** (env vars, dependencies, data?)

**Action**: Use `read_file` to check git history or recent commits

## Phase 2: ANALYZE (Identify Patterns & Narrow Down)

**Goal**: Find the root cause by eliminating possibilities

### Step 2.1: Form Initial Hypothesis
Based on evidence, what are the **most likely causes**?

**Example Hypotheses**:
1. Event handler not attached (listener missing?)
2. API call blocked by CORS (network issue?)
3. Form validation preventing submission (silent failure?)
4. State not updating (React re-render issue?)

### Step 2.2: Eliminate Possibilities (Binary Search)
Use **binary search** to narrow down:

- **Is the event firing?** → Add `console.log` in onClick
- **Is the API being called?** → Check Network tab
- **Is the request valid?** → Log request payload
- **Is the server responding?** → Check server logs

**Example Investigation**:
```typescript
// Add logging to narrow down
const handleSubmit = async () => {
  console.log('1. Submit handler called'); // CHECK: Does this log?

  const isValid = validateForm();
  console.log('2. Form valid?', isValid); // CHECK: Is validation passing?

  if (!isValid) return;

  console.log('3. About to call API'); // CHECK: Does execution reach here?

  const response = await fetch('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(formData),
  });

  console.log('4. API response:', response); // CHECK: What's the response?
};
```

**Action**: Use `read_file` to read the suspected file and add logging

### Step 2.3: Check Similar Bugs
- **Search codebase** for similar patterns or issues
- **Check documentation** for known limitations
- **Search GitHub issues** for related bugs

**Action**: Use `grep_files` to search for similar code patterns

### Step 2.4: Identify Root Cause
Once you've narrowed it down, **explain the root cause**:

**Example Root Cause**:
```
ROOT CAUSE: The onClick handler is wrapped in `useCallback` with
an empty dependency array, so it captures stale `formData` from
the initial render. When the user fills out the form, the handler
still references the old empty state.

EVIDENCE:
- Console log shows formData as {} inside handler
- React DevTools shows formData state updated correctly
- Removing useCallback fixes the issue
```

## Phase 3: HYPOTHESIZE (Test Your Theory)

**Goal**: Validate your hypothesis before committing to a fix

### Step 3.1: Predict the Outcome
Before making changes, **predict** what will happen:

**Hypothesis**: "If I add `formData` to the useCallback dependency array, the handler will capture the latest state and the API call will succeed."

**Prediction**: "After this change, the console will log the correct formData, the API call will fire, and the payment will process."

### Step 3.2: Test the Hypothesis (Minimal Change)
- **Make the smallest possible change** to test your theory
- **Verify the prediction** (does it match expected outcome?)
- **If wrong**, go back to Phase 2 (re-analyze)

**Example Test**:
```typescript
// BEFORE (buggy)
const handleSubmit = useCallback(async () => {
  // formData is stale
  await fetch('/api/checkout', { body: JSON.stringify(formData) });
}, []); // Empty deps

// AFTER (test hypothesis)
const handleSubmit = useCallback(async () => {
  console.log('formData in handler:', formData); // Should log latest state
  await fetch('/api/checkout', { body: JSON.stringify(formData) });
}, [formData]); // Add formData to deps
```

**Action**: Test the change → Does it fix the bug?

### Step 3.3: Verify No Side Effects
- **Run full test suite** (ensure nothing else broke)
- **Test related features** (form validation, error handling)
- **Check edge cases** (empty form, network errors)

## Phase 4: FIX (Implement & Verify)

**Goal**: Apply the fix properly with tests and documentation

### Step 4.1: Write a Failing Test (TDD)
Before finalizing the fix, **write a test** that exposes the bug:

```typescript
// checkout.test.tsx
it('should submit payment with latest form data', async () => {
  const mockSubmit = jest.fn();
  render(<CheckoutForm onSubmit={mockSubmit} />);

  // Fill out form
  fireEvent.change(screen.getByLabelText('Card Number'), {
    target: { value: '4242 4242 4242 4242' },
  });

  // Submit
  fireEvent.click(screen.getByText('Submit Payment'));

  // Verify correct data was submitted
  await waitFor(() => {
    expect(mockSubmit).toHaveBeenCalledWith({
      cardNumber: '4242 4242 4242 4242',
      // ... other fields
    });
  });
});
```

**Action**: Run test → Verify it **FAILS** (bug exists)

### Step 4.2: Apply the Fix
Implement the minimal fix:

```typescript
const handleSubmit = useCallback(async () => {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  if (!response.ok) throw new Error('Payment failed');

  router.push('/success');
}, [formData, router]); // ✅ Include all dependencies
```

**Action**: Run test → Verify it **PASSES** (bug fixed)

### Step 4.3: Verify the Fix
- **Manual test**: Reproduce original bug → Should be gone
- **Automated test**: Run full suite → All green
- **Edge cases**: Test boundary conditions

### Step 4.4: Document the Fix
**Commit Message Format**:
```
fix(checkout): include formData in useCallback deps to prevent stale closure

ROOT CAUSE:
useCallback with empty deps captured stale formData from initial render.
User input updated state but handler still referenced old values.

SOLUTION:
Added formData and router to dependency array so handler always uses
latest state.

REGRESSION PREVENTION:
Added test to verify form data is submitted correctly after user input.

Fixes #123
```

## Debugging Tools & Commands

### Search for Error Messages
```bash
grep_files pattern:"Cannot read property"
```

### Find Function Definitions
```bash
grep_files pattern:"function handleSubmit|const handleSubmit"
```

### Read Suspected Files
```bash
read_file path:"src/components/checkout/CheckoutForm.tsx"
```

### Check Git History
```bash
# (Use version control tools)
git log --oneline --follow src/components/checkout/CheckoutForm.tsx
```

## Common Bug Patterns & Solutions

### Pattern 1: Stale Closure (React Hooks)
**Symptom**: State is updated but handler uses old value
**Root Cause**: Missing dependencies in useCallback/useEffect
**Fix**: Add missing deps to dependency array

### Pattern 2: Async Race Condition
**Symptom**: API calls return out of order, wrong data displayed
**Root Cause**: Multiple async calls without cleanup
**Fix**: Use AbortController or ignore stale responses

### Pattern 3: Event Not Firing
**Symptom**: onClick/onSubmit doesn't trigger
**Root Cause**: Event propagation stopped, overlay blocking clicks
**Fix**: Check z-index, pointer-events, stopPropagation

### Pattern 4: Type Error (TypeScript)
**Symptom**: "Cannot read property 'X' of undefined"
**Root Cause**: Accessing nested property without null check
**Fix**: Use optional chaining (`data?.user?.name`)

## Three-Strike Escalation

**After 3 failed fix attempts, STOP and trigger architectural review:**

1. **Analyze patterns**: Is the bug a symptom of deeper design issues?
2. **Propose refactor**: Should we restructure this code?
3. **Document findings**: What did we learn? What needs to change?

**Example Escalation**:
```
After 3 attempts to fix the checkout bug, I've identified a systemic issue:

PROBLEM: The checkout flow has too many layers of state management
(useState + useReducer + Context + localStorage), making it impossible
to track data flow.

RECOMMENDATION: Refactor to a single source of truth using Zustand or
React Query. This will eliminate stale closure bugs and make state
predictable.

NEXT STEPS: Propose refactor plan, get approval, implement with TDD.
```

## Remember

> "Debugging is like being the detective in a crime movie where you are also the murderer." — Filipe Fortes

**Don't guess. Investigate.**

## Checklist Before Applying Fix

- [ ] Have I clearly defined the problem?
- [ ] Have I reproduced the bug reliably?
- [ ] Have I gathered evidence (logs, network, debugger)?
- [ ] Have I identified the root cause (not just symptoms)?
- [ ] Have I tested my hypothesis?
- [ ] Have I written a failing test?
- [ ] Does the fix make the test pass?
- [ ] Have I verified no side effects?
- [ ] Have I documented the fix?

**If any answer is NO, you're not done debugging.**
