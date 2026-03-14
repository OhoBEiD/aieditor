---
name: code-review
description: 2-stage code review - spec compliance + code quality
category: code-review
auto-inject: false
---

# Code Review - Two-Stage Quality Gate

**CRITICAL**: This skill enforces quality standards. Code **MUST** pass both stages before approval.

## Core Principle

**Compliance → Quality** is **MANDATORY**. Every implementation **MUST** pass 2 stages:

1. **STAGE 1: Spec Compliance**: Does the code match the plan/design?
2. **STAGE 2: Code Quality**: Is the code maintainable, tested, and following best practices?

## Hard Rules (ZERO TOLERANCE FOR POOR CODE)

### Rule 1: No Exceptions
- ❌ **NEVER** approve code that fails either stage
- ❌ **NEVER** skip review for "small changes"
- ✅ **ALWAYS** review against the approved plan/design
- ✅ **ALWAYS** check for tests, types, and best practices

**If code doesn't meet standards, it doesn't ship.**

### Rule 2: Review Own Code
- **Even AI-generated code** must be reviewed
- **Even "working" code** can have hidden issues
- **Review immediately** after writing (fresh perspective)

### Rule 3: Fail Fast
- **Stage 1 fails** → Don't proceed to Stage 2
- **Stage 2 fails** → Require fixes before approval
- **No partial approvals** → Either pass or fail

## STAGE 1: Spec Compliance Review

**Goal**: Verify implementation matches the approved plan/design

### Checklist 1.1: Requirements Coverage

**Review Question**: Does the code implement ALL requirements from the plan?

**Check**:
- [ ] All planned features are implemented
- [ ] All planned files are created/modified
- [ ] All planned edge cases are handled
- [ ] No scope creep (extra features not in plan)

**Example**:
```
PLAN SAYS:
- Create login form with email + password fields
- Validate email format
- Show error messages for invalid input
- Redirect to /dashboard on success

CODE CHECK:
✅ Login form exists (LoginForm.tsx)
✅ Email + password fields present
✅ Email validation implemented (regex check)
✅ Error messages displayed (FormError component)
✅ Redirect to /dashboard after login
✅ No extra features (e.g., "remember me" checkbox not in plan)
```

**Action**: Read the plan/task description → Read the code → Verify match

### Checklist 1.2: Design Consistency

**Review Question**: Does the code follow the approved architecture?

**Check**:
- [ ] File structure matches plan
- [ ] Component hierarchy matches design
- [ ] Data flow matches architecture (props, state, context)
- [ ] API contracts match spec (request/response format)

**Example**:
```
DESIGN SAYS:
- State managed via Zustand (not Context API)
- API calls in separate service layer (not in components)
- Form validation via Zod schemas

CODE CHECK:
✅ Zustand store created (authStore.ts)
✅ API service layer exists (authService.ts)
✅ Zod schema for login form (loginSchema.ts)
❌ FAIL: Component directly calls fetch (violates service layer rule)
```

**Fail Reason**: Code violates architectural decision (fetch in component)

**Action**: Compare code structure to design document

### Checklist 1.3: Test Coverage

**Review Question**: Are all requirements covered by tests?

**Check**:
- [ ] Unit tests for business logic
- [ ] Integration tests for user flows
- [ ] Edge case tests (error handling, empty states)
- [ ] Tests are passing (green)

**Example**:
```
REQUIRED TESTS:
- Login with valid credentials → success
- Login with invalid email → error message
- Login with wrong password → error message
- Network error during login → retry prompt

CODE CHECK:
✅ login.test.ts exists
✅ Test: valid credentials → success
✅ Test: invalid email → error
❌ MISSING: wrong password test
❌ MISSING: network error test
```

**Fail Reason**: Incomplete test coverage (missing 2 scenarios)

**Action**: Use `grep_files` to find test files → Read tests → Verify coverage

### Checklist 1.4: Verification Steps

**Review Question**: Can we verify the implementation works as described?

**Check**:
- [ ] Verification steps from plan are executable
- [ ] Manual testing confirms expected behavior
- [ ] No regressions (existing features still work)

**Example**:
```
VERIFICATION PLAN:
1. Navigate to /login
2. Enter valid email + password
3. Click "Log In"
4. EXPECT: Redirect to /dashboard with user session

MANUAL TEST:
✅ /login page loads
✅ Form accepts input
✅ Submit triggers API call
❌ FAIL: Redirect goes to /home instead of /dashboard
```

**Fail Reason**: Implementation doesn't match expected behavior

**Action**: Follow verification steps → Document results

### Stage 1 Decision

**PASS**: All requirements implemented, design followed, tests exist, verification successful
**FAIL**: Any checklist item fails → Require fixes → Re-review

**If Stage 1 fails, STOP. Don't proceed to Stage 2 until fixed.**

## STAGE 2: Code Quality Review

**Goal**: Ensure code is maintainable, efficient, and follows best practices

### Checklist 2.1: Code Readability

**Review Question**: Can another developer understand this code easily?

**Check**:
- [ ] Variable/function names are descriptive
- [ ] Complex logic has comments explaining WHY (not what)
- [ ] Functions are small (< 50 lines)
- [ ] No magic numbers/strings (use constants)

**Example**:
```typescript
// ❌ BAD: Unclear, magic numbers
const x = (y * 0.08) + (y * 0.02);
if (x > 1000) { ... }

// ✅ GOOD: Clear, named constants
const TAX_RATE = 0.08;
const FEE_RATE = 0.02;
const totalWithFees = subtotal * TAX_RATE + subtotal * FEE_RATE;
const MAX_TRANSACTION_LIMIT = 1000;
if (totalWithFees > MAX_TRANSACTION_LIMIT) { ... }
```

**Action**: Read the code → Highlight unclear sections → Suggest improvements

### Checklist 2.2: Type Safety (TypeScript)

**Review Question**: Are types used correctly to prevent bugs?

**Check**:
- [ ] No `any` types (unless absolutely necessary)
- [ ] Function parameters are typed
- [ ] Return types are explicit
- [ ] Props are typed (React components)
- [ ] API responses are typed (Zod validation)

**Example**:
```typescript
// ❌ BAD: any types, no validation
const login = async (data: any) => {
  const res = await fetch('/api/login', { body: JSON.stringify(data) });
  return res.json(); // Returns any
};

// ✅ GOOD: Strict types, Zod validation
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginData = z.infer<typeof LoginSchema>;
type LoginResponse = { token: string; user: { id: string; email: string } };

const login = async (data: LoginData): Promise<LoginResponse> => {
  const validated = LoginSchema.parse(data); // Runtime validation
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validated),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
};
```

**Action**: Search for `any` types → Check function signatures → Verify validation

### Checklist 2.3: Error Handling

**Review Question**: Are errors handled gracefully?

**Check**:
- [ ] Try/catch blocks for async operations
- [ ] User-friendly error messages (not technical jargon)
- [ ] Errors are logged (for debugging)
- [ ] Network failures have retry logic or fallback

**Example**:
```typescript
// ❌ BAD: No error handling, silent failures
const fetchUser = async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json(); // What if fetch fails?
};

// ✅ GOOD: Comprehensive error handling
const fetchUser = async (id: string): Promise<User> => {
  try {
    const res = await fetch(`/api/users/${id}`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`User ${id} not found`);
      }
      throw new Error(`Failed to fetch user: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('[fetchUser] Error:', error);

    // User-friendly message
    if (error instanceof Error) {
      throw new Error(`Unable to load user profile. ${error.message}`);
    }
    throw new Error('An unexpected error occurred. Please try again.');
  }
};
```

**Action**: Check for try/catch → Verify error messages → Test error scenarios

### Checklist 2.4: Performance & Efficiency

**Review Question**: Is the code performant and avoiding unnecessary work?

**Check**:
- [ ] No unnecessary re-renders (React.memo, useMemo, useCallback)
- [ ] Database queries are optimized (indexes, limits, pagination)
- [ ] Large lists use virtualization (react-window)
- [ ] Images are optimized (WebP, lazy loading)
- [ ] API calls are debounced/throttled (search, autocomplete)

**Example**:
```typescript
// ❌ BAD: Unnecessary re-renders, no memoization
const ExpensiveComponent = ({ data }: { data: Item[] }) => {
  const sorted = data.sort((a, b) => b.price - a.price); // Sorts on every render
  return <div>{sorted.map(item => <ItemCard key={item.id} {...item} />)}</div>;
};

// ✅ GOOD: Memoization prevents unnecessary work
const ExpensiveComponent = React.memo(({ data }: { data: Item[] }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.price - a.price),
    [data]
  );

  return (
    <div>
      {sorted.map(item => (
        <ItemCard key={item.id} {...item} />
      ))}
    </div>
  );
});
```

**Action**: Check for performance anti-patterns → Suggest optimizations

### Checklist 2.5: Security

**Review Question**: Are there security vulnerabilities?

**Check**:
- [ ] No hardcoded secrets (API keys, passwords)
- [ ] Input is validated/sanitized (prevent XSS, SQL injection)
- [ ] Authentication is enforced on protected routes
- [ ] Sensitive data is not logged
- [ ] HTTPS is used for API calls

**Example**:
```typescript
// ❌ BAD: XSS vulnerability, no sanitization
const UserComment = ({ comment }: { comment: string }) => {
  return <div dangerouslySetInnerHTML={{ __html: comment }} />; // XSS risk
};

// ✅ GOOD: Safe rendering, sanitized if HTML needed
import DOMPurify from 'dompurify';

const UserComment = ({ comment }: { comment: string }) => {
  const sanitized = DOMPurify.sanitize(comment);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
};

// Even better: Don't use innerHTML at all
const UserComment = ({ comment }: { comment: string }) => {
  return <div>{comment}</div>; // React escapes automatically
};
```

**Action**: Check for security anti-patterns → Flag vulnerabilities

### Checklist 2.6: Best Practices (Framework-Specific)

**Review Question**: Does code follow framework/library conventions?

**React/Next.js Specific**:
- [ ] Use `next/image` for images (not `<img>`)
- [ ] Use `next/link` for navigation (not `<a>`)
- [ ] Server Components by default, Client Components only when needed
- [ ] Use `use client` directive appropriately
- [ ] Avoid `useEffect` for data fetching (use React Query or Server Components)

**Example**:
```typescript
// ❌ BAD: Not using Next.js optimizations
import Image from 'next/image';

const Hero = () => (
  <div>
    <img src="/hero.jpg" alt="Hero" /> {/* Should use next/image */}
    <a href="/about">Learn More</a> {/* Should use next/link */}
  </div>
);

// ✅ GOOD: Using Next.js best practices
import Image from 'next/image';
import Link from 'next/link';

const Hero = () => (
  <div>
    <Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
    <Link href="/about">Learn More</Link>
  </div>
);
```

**Action**: Check framework-specific patterns → Suggest improvements

### Stage 2 Decision

**PASS**: Code is readable, type-safe, handles errors, performant, secure, follows best practices
**FAIL**: Any checklist item fails → Require fixes → Re-review

## Review Outcome

### ✅ APPROVED (Both Stages Pass)
- All requirements implemented
- Design followed
- Tests exist and pass
- Code is high quality
- No security vulnerabilities

**Action**: Merge code → Mark task as complete

### ❌ NEEDS WORK (Either Stage Fails)
- Document all failing checklist items
- Provide specific feedback for each issue
- Suggest concrete improvements
- Re-review after fixes

**Example Feedback**:
```
CODE REVIEW FAILED - Stage 2: Code Quality

Issues Found:

1. TYPE SAFETY (CRITICAL)
   - File: src/components/LoginForm.tsx:42
   - Issue: Function `handleSubmit` uses `any` type for form data
   - Fix: Type as `LoginData` and validate with Zod

2. ERROR HANDLING (HIGH)
   - File: src/services/authService.ts:15
   - Issue: No try/catch around fetch call
   - Fix: Wrap in try/catch, provide user-friendly error message

3. PERFORMANCE (MEDIUM)
   - File: src/components/UserList.tsx:23
   - Issue: Large list (1000+ items) without virtualization
   - Fix: Use react-window or pagination

4. BEST PRACTICES (LOW)
   - File: src/app/login/page.tsx:5
   - Issue: Using <img> instead of next/image
   - Fix: Replace with next/image for optimization

RECOMMENDATION: Fix critical + high issues before re-review.
Low priority can be addressed in follow-up PR.
```

## Review Anti-Patterns (AVOID)

❌ **"Looks good to me" (LGTM)**: Lazy review without actually checking
✅ **Detailed feedback**: Specific issues with line numbers and fixes

❌ **Approving code you don't understand**: If unclear, ask questions
✅ **Thorough review**: Understand code before approving

❌ **Nit-picking minor style issues**: Focus on correctness first
✅ **Prioritized feedback**: Critical > High > Medium > Low

❌ **Blocking on personal preferences**: Enforce standards, not opinions
✅ **Objective criteria**: Code standards, not "I would do it differently"

## Remember

> "Code reviews are not about finding fault. They're about finding bugs before users do." — Unknown

**Every review makes the codebase stronger.**

## Checklist Before Approving Code

### Stage 1: Spec Compliance
- [ ] All requirements implemented
- [ ] Design/architecture followed
- [ ] Tests exist and cover requirements
- [ ] Verification steps pass

### Stage 2: Code Quality
- [ ] Code is readable (clear names, comments)
- [ ] Types are strict (no `any`)
- [ ] Errors are handled gracefully
- [ ] Performance is acceptable (no obvious bottlenecks)
- [ ] No security vulnerabilities
- [ ] Follows framework best practices

**If any answer is NO, the code is NOT ready to merge.**
