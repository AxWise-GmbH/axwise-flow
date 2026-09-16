/**
 * Bundled skill packs — shipped with Orqaly.
 * Each skill provides a detailed markdown prompt template that agents can use
 * to enhance their capabilities in specific domains.
 */

export const SKILL_CATEGORIES = [
  {
    value: 'prompt-engineering',
    label: 'Prompt Engineering',
    color: '#7C3AED',
    icon: 'psychology',
  },
  { value: 'code-dev', label: 'Code & Development', color: '#2563EB', icon: 'code' },
  { value: 'business', label: 'Business & Strategy', color: '#059669', icon: 'business' },
  { value: 'content', label: 'Content & Marketing', color: '#D97706', icon: 'article' },
  { value: 'data', label: 'Data & Analytics', color: '#DC2626', icon: 'analytics' },
  { value: 'ops', label: 'Operations & PM', color: '#4F46E5', icon: 'settings' },
  { value: 'creative', label: 'Creative & Design', color: '#EC4899', icon: 'lightbulb' },
];

export const BUNDLED_SKILLS = [
  /* ────────────────────────────────────────────────────────────────────────
   * PROMPT ENGINEERING (3)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'chain-of-thought',
    name: 'Chain-of-Thought Reasoning',
    description:
      'Guide the agent to break complex problems into sequential reasoning steps for more accurate and transparent outputs.',
    category: 'prompt-engineering',
    tags: ['reasoning', 'step-by-step', 'accuracy', 'prompting'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'psychology',
    is_bundled: true,
    content: `# Chain-of-Thought Reasoning

## Purpose
Enable step-by-step reasoning to improve accuracy on complex tasks. Instead of jumping to conclusions, the agent decomposes problems into logical intermediate steps.

## When to Apply
- Multi-step math or logic problems
- Complex decision-making with multiple factors
- Tasks requiring justification or explanation of reasoning
- Any scenario where the final answer depends on intermediate conclusions

## Technique

### Step 1: Problem Decomposition
Break the user's request into distinct sub-problems. Identify dependencies between sub-problems and determine the optimal order of resolution.

### Step 2: Sequential Reasoning
For each sub-problem:
1. State the sub-problem clearly
2. Identify relevant information and constraints
3. Apply reasoning to reach an intermediate conclusion
4. Verify the intermediate conclusion before proceeding

### Step 3: Synthesis
Combine intermediate conclusions into a final, coherent answer. Cross-check that the final answer is consistent with all intermediate steps.

## Output Format
\`\`\`
**Step 1:** [Sub-problem description]
Reasoning: [Logical analysis]
Intermediate result: [Conclusion]

**Step 2:** [Next sub-problem]
Reasoning: [Logical analysis]
Intermediate result: [Conclusion]

...

**Final Answer:** [Synthesized conclusion based on all steps]
\`\`\`

## Best Practices
- Never skip steps even if the answer seems obvious
- Explicitly state assumptions at each step
- If a step reveals an error in a previous step, backtrack and correct
- Use numbered steps for traceability
- Conclude with a confidence assessment when appropriate`,
  },
  {
    slug: 'few-shot-prompting',
    name: 'Few-Shot Prompting',
    description:
      'Provide example input-output pairs so the agent learns the desired pattern and produces consistently formatted results.',
    category: 'prompt-engineering',
    tags: ['examples', 'consistency', 'formatting', 'prompting'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'psychology',
    is_bundled: true,
    content: `# Few-Shot Prompting

## Purpose
Guide the agent's output format and reasoning style by providing concrete examples. Few-shot prompting dramatically improves consistency and reduces ambiguity in agent responses.

## When to Apply
- Tasks requiring a specific output structure
- Classification or categorization tasks
- Data transformation or reformatting
- Any task where showing is clearer than telling

## Technique

### Step 1: Define the Pattern
Identify the input format, the expected output format, and the transformation rules between them. Be explicit about edge cases.

### Step 2: Craft Representative Examples
Create 2-5 examples that cover:
- The most common / happy-path case
- An edge case (empty input, unusual data)
- A boundary case that clarifies ambiguity

### Step 3: Structure the Prompt
\`\`\`
Here are examples of [task description]:

**Example 1:**
Input: [example input]
Output: [example output]

**Example 2:**
Input: [example input with edge case]
Output: [example output for edge case]

**Example 3:**
Input: [example input with boundary]
Output: [example output for boundary]

Now apply the same pattern:
Input: [actual user input]
Output:
\`\`\`

### Step 4: Validate Consistency
After the agent produces output, verify it matches the pattern established by the examples. If it deviates, add a corrective example and retry.

## Best Practices
- Use real-world data in examples when possible
- Order examples from simple to complex
- Include at least one negative example (what NOT to do) for classification tasks
- Keep examples concise but complete
- Label examples clearly with numbered headers
- If the task has multiple valid outputs, show the preferred style`,
  },
  {
    slug: 'output-formatting',
    name: 'Output Formatting & Structure',
    description:
      'Enforce consistent markdown, JSON, or structured output from agent responses for downstream parsing and display.',
    category: 'prompt-engineering',
    tags: ['formatting', 'markdown', 'json', 'structure', 'parsing'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'psychology',
    is_bundled: true,
    content: `# Output Formatting & Structure

## Purpose
Ensure agent outputs conform to a predictable structure that can be reliably parsed, displayed, or fed into downstream systems. Eliminates the "wall of text" problem.

## When to Apply
- API-facing agents that must return JSON
- Report-generating agents that need consistent sections
- Agents whose output is displayed in UI components
- Multi-agent pipelines where one agent's output is another's input

## Supported Formats

### Markdown Report
\`\`\`markdown
# [Title]

## Summary
[2-3 sentence overview]

## Key Findings
- **Finding 1:** [Description]
- **Finding 2:** [Description]

## Details
[Detailed analysis organized by topic]

## Recommendations
1. [Action item with owner and deadline]
2. [Action item with owner and deadline]
\`\`\`

### JSON Response
\`\`\`json
{
  "status": "success|error",
  "summary": "Brief description",
  "data": { },
  "metadata": {
    "generated_at": "ISO timestamp",
    "confidence": 0.0-1.0,
    "sources": []
  }
}
\`\`\`

### Table Format
Use markdown tables for comparative data:
| Column A | Column B | Column C |
|----------|----------|----------|
| Value    | Value    | Value    |

## Enforcement Rules
1. Always start with the specified format header
2. Never mix formats within a single response
3. Use code fences for any embedded code or data
4. Keep section headings consistent across responses
5. Include metadata (timestamp, confidence, source) when applicable
6. Validate JSON output is parseable before returning
7. Use bullet points for lists of 3+ items, inline for fewer

## Best Practices
- Define the format in the system prompt, not the user prompt
- Provide a template with placeholders for the agent to fill
- Use schema validation for JSON outputs in production
- Test with edge cases (empty data, very long content, special characters)`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * CODE & DEVELOPMENT (6)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'code-review-checklist',
    name: 'Code Review Checklist',
    description:
      'Systematic code review covering correctness, security, performance, readability, and maintainability.',
    category: 'code-dev',
    tags: ['code-review', 'quality', 'security', 'best-practices'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# Code Review Checklist

## Purpose
Provide a structured, repeatable code review process that catches bugs, security issues, and maintainability problems before they reach production.

## Review Dimensions

### 1. Correctness
- [ ] Does the code do what it claims to do?
- [ ] Are edge cases handled (null, empty, overflow, concurrency)?
- [ ] Are error paths tested and handled gracefully?
- [ ] Do loops have correct termination conditions?
- [ ] Are return values and types correct?

### 2. Security
- [ ] No hardcoded secrets, tokens, or credentials
- [ ] User input is validated and sanitized
- [ ] SQL queries use parameterized statements (no string concatenation)
- [ ] Authentication and authorization checks are in place
- [ ] Sensitive data is not logged or exposed in error messages
- [ ] Dependencies are up to date and free of known CVEs

### 3. Performance
- [ ] No unnecessary database queries (N+1 problem)
- [ ] Large datasets are paginated or streamed
- [ ] Expensive computations are cached where appropriate
- [ ] No memory leaks (event listeners, intervals, open connections)
- [ ] Async operations are properly awaited

### 4. Readability
- [ ] Variable and function names are descriptive
- [ ] Functions are single-responsibility (< 30 lines preferred)
- [ ] Comments explain "why", not "what"
- [ ] No dead code or commented-out blocks
- [ ] Consistent formatting and style

### 5. Maintainability
- [ ] No code duplication (DRY principle)
- [ ] Dependencies are minimal and justified
- [ ] Configuration is externalized (not hardcoded)
- [ ] Tests cover the changed code paths
- [ ] Breaking changes are documented

## Output Format
For each issue found:
\`\`\`
**[SEVERITY]** [DIMENSION] — Line [N]
Description: [What is wrong]
Suggestion: [How to fix it]
\`\`\`

Severity levels: CRITICAL, WARNING, INFO`,
  },
  {
    slug: 'test-driven-development',
    name: 'Test-Driven Development',
    description:
      'Write tests before implementation code following the red-green-refactor cycle for reliable, well-designed software.',
    category: 'code-dev',
    tags: ['testing', 'tdd', 'unit-tests', 'quality'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# Test-Driven Development (TDD)

## Purpose
Write tests before implementation to ensure every feature is verifiable, edge cases are considered upfront, and the design stays simple and focused.

## The Red-Green-Refactor Cycle

### Phase 1: RED — Write a Failing Test
1. Identify the smallest unit of behavior to implement
2. Write a test that asserts the expected behavior
3. Run the test and confirm it fails (red)
4. If the test passes without new code, the test is not testing anything new

### Phase 2: GREEN — Make It Pass
1. Write the minimum code necessary to make the test pass
2. Do not over-engineer or add features not covered by a test
3. Run the test and confirm it passes (green)
4. Run the full test suite to ensure no regressions

### Phase 3: REFACTOR — Clean Up
1. Improve code structure without changing behavior
2. Remove duplication, improve naming, simplify logic
3. Run all tests again to confirm nothing broke
4. Commit the refactored code

## Test Structure (Arrange-Act-Assert)
\`\`\`javascript
describe('calculateDiscount', () => {
  it('should apply 10% discount for orders over $100', () => {
    // Arrange
    const order = { total: 150, customerType: 'regular' };

    // Act
    const result = calculateDiscount(order);

    // Assert
    expect(result).toBe(135);
  });

  it('should return original total for orders under $100', () => {
    const order = { total: 50, customerType: 'regular' };
    const result = calculateDiscount(order);
    expect(result).toBe(50);
  });
});
\`\`\`

## What to Test
- Happy path (expected inputs produce expected outputs)
- Edge cases (empty, null, boundary values, max/min)
- Error conditions (invalid input, network failures, timeouts)
- State transitions (before/after side effects)

## Best Practices
- One assertion per test (or one logical assertion group)
- Tests should be independent and order-agnostic
- Use descriptive test names that read like specifications
- Mock external dependencies, not internal implementation
- Keep test setup DRY with beforeEach / fixtures
- Aim for >80% code coverage but prioritize critical paths`,
  },
  {
    slug: 'api-design-best-practices',
    name: 'API Design Best Practices',
    description:
      'Design RESTful APIs with consistent naming, proper status codes, pagination, versioning, and error handling.',
    category: 'code-dev',
    tags: ['api', 'rest', 'design', 'architecture'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# API Design Best Practices

## Purpose
Design APIs that are consistent, intuitive, well-documented, and easy to consume. Good API design reduces integration friction and support burden.

## URL Structure
\`\`\`
GET    /api/v1/users          — List users (paginated)
GET    /api/v1/users/:id      — Get single user
POST   /api/v1/users          — Create user
PUT    /api/v1/users/:id      — Full update
PATCH  /api/v1/users/:id      — Partial update
DELETE /api/v1/users/:id      — Delete user
\`\`\`

### Naming Conventions
- Use plural nouns for collections: \`/users\`, not \`/user\`
- Use kebab-case for multi-word resources: \`/user-profiles\`
- Nest related resources: \`/users/:id/orders\`
- Use query params for filtering: \`/users?role=admin&status=active\`
- Avoid verbs in URLs (use HTTP methods instead)

## Status Codes
| Code | Meaning | When to Use |
|------|---------|-------------|
| 200  | OK | Successful GET, PUT, PATCH |
| 201  | Created | Successful POST that creates a resource |
| 204  | No Content | Successful DELETE |
| 400  | Bad Request | Invalid input, missing required fields |
| 401  | Unauthorized | Missing or invalid authentication |
| 403  | Forbidden | Authenticated but insufficient permissions |
| 404  | Not Found | Resource does not exist |
| 409  | Conflict | Duplicate resource, version conflict |
| 422  | Unprocessable | Valid syntax but semantic errors |
| 429  | Too Many Requests | Rate limit exceeded |
| 500  | Internal Error | Unhandled server error |

## Pagination
\`\`\`json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
\`\`\`

## Error Response Format
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      { "field": "email", "message": "must not be empty" }
    ]
  }
}
\`\`\`

## Best Practices
- Always version your API (\`/v1/\`, \`/v2/\`)
- Use consistent date format (ISO 8601)
- Include rate limit headers in every response
- Support filtering, sorting, and field selection
- Return the created/updated resource in the response body
- Use ETags for caching and conditional requests
- Document every endpoint with request/response examples`,
  },
  {
    slug: 'debugging-systematic',
    name: 'Systematic Debugging',
    description:
      'Structured approach to diagnosing and fixing software bugs using isolation, reproduction, and bisection techniques.',
    category: 'code-dev',
    tags: ['debugging', 'troubleshooting', 'root-cause', 'diagnosis'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# Systematic Debugging

## Purpose
Replace ad-hoc debugging with a repeatable process that reliably identifies root causes. Stop guessing and start isolating.

## The Debugging Process

### Step 1: Reproduce
- Can you reproduce the bug consistently?
- What are the exact steps, inputs, and environment?
- Does it reproduce in all environments or only specific ones?
- Write down the reproduction steps before proceeding

### Step 2: Isolate
- When did it last work correctly? (git bisect)
- What changed between working and broken states?
- Can you reproduce with minimal code / inputs?
- Is it a data issue, code issue, or environment issue?

### Step 3: Diagnose
- Read the error message carefully (do not skim)
- Check logs at the point of failure and immediately before
- Add logging at suspected failure points
- Use a debugger to step through the code path
- Check assumptions: are inputs what you expect at each stage?

### Step 4: Formulate Hypothesis
- Based on evidence, propose a specific root cause
- The hypothesis must be falsifiable (you can test it)
- Write it down: "I believe the bug is caused by X because of evidence Y"

### Step 5: Test and Fix
- Make the smallest possible change to test your hypothesis
- If the hypothesis is wrong, return to Step 3 with new evidence
- If correct, write a test that fails without the fix and passes with it
- Verify the fix does not introduce regressions

### Step 6: Document
- Record the root cause, the fix, and any lessons learned
- Update runbooks or documentation if the failure mode is new
- Consider adding monitoring for the failure condition

## Common Bug Patterns
| Symptom | Likely Cause |
|---------|-------------|
| Works locally, fails in production | Environment variable, dependency version, or config difference |
| Intermittent failure | Race condition, timeout, or external service flakiness |
| Null pointer / undefined | Missing null check, async data not yet loaded |
| Silent failure | Swallowed exception, missing error handler |
| Wrong data returned | Stale cache, incorrect query filter, off-by-one |

## Best Practices
- Never change more than one thing at a time when debugging
- Use version control to track and revert debug changes
- Rubber-duck explain the problem before diving into code
- Time-box your debugging: if stuck for 30min, take a break or ask for help`,
  },
  {
    slug: 'security-audit-checklist',
    name: 'Security Audit Checklist',
    description:
      'Comprehensive security review covering OWASP Top 10, authentication, data protection, and infrastructure hardening.',
    category: 'code-dev',
    tags: ['security', 'audit', 'owasp', 'compliance', 'hardening'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# Security Audit Checklist

## Purpose
Systematically review an application's security posture against common vulnerability categories. This checklist covers the OWASP Top 10 and additional best practices.

## Audit Categories

### 1. Authentication & Session Management
- [ ] Passwords are hashed with bcrypt/argon2 (never MD5/SHA1)
- [ ] Session tokens are cryptographically random and sufficiently long
- [ ] Sessions expire after inactivity (30min recommended)
- [ ] Multi-factor authentication is available for sensitive operations
- [ ] Account lockout after repeated failed login attempts
- [ ] Password reset tokens are single-use and time-limited

### 2. Authorization & Access Control
- [ ] Every API endpoint verifies user permissions
- [ ] Row-level security is enabled on database tables
- [ ] Admin functions are not accessible to regular users
- [ ] IDOR vulnerabilities are prevented (user can only access own resources)
- [ ] Role changes require re-authentication

### 3. Input Validation & Injection
- [ ] All user input is validated on the server side
- [ ] SQL queries use parameterized statements exclusively
- [ ] HTML output is escaped to prevent XSS
- [ ] File uploads are validated (type, size, content scanning)
- [ ] URL redirects are validated against an allowlist
- [ ] Command injection is prevented (no shell execution of user input)

### 4. Data Protection
- [ ] Sensitive data is encrypted at rest (AES-256)
- [ ] All traffic uses TLS 1.2+ (HTTPS only, HSTS enabled)
- [ ] PII is minimized and retention policies are defined
- [ ] Secrets are stored in environment variables, not in code
- [ ] Logs do not contain sensitive data (passwords, tokens, PII)
- [ ] Backups are encrypted and access-controlled

### 5. API Security
- [ ] Rate limiting is implemented on all endpoints
- [ ] CORS is configured with specific origins (not wildcard)
- [ ] API keys are rotated regularly
- [ ] Request size limits are enforced
- [ ] Verbose error messages are not returned in production

### 6. Infrastructure
- [ ] Dependencies are scanned for known vulnerabilities
- [ ] Container images use minimal base images
- [ ] Security headers are set (CSP, X-Frame-Options, X-Content-Type-Options)
- [ ] Monitoring and alerting are configured for suspicious activity
- [ ] Incident response plan is documented and tested

## Severity Rating
- **Critical:** Exploitable now, leads to data breach or system compromise
- **High:** Exploitable with moderate effort, significant impact
- **Medium:** Requires specific conditions, limited impact
- **Low:** Defense in depth, minimal direct impact`,
  },
  {
    slug: 'performance-optimization',
    name: 'Performance Optimization',
    description:
      'Identify and resolve performance bottlenecks in web applications covering frontend, backend, and database layers.',
    category: 'code-dev',
    tags: ['performance', 'optimization', 'speed', 'caching', 'profiling'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'code',
    is_bundled: true,
    content: `# Performance Optimization

## Purpose
Systematically identify and resolve performance bottlenecks across all layers of a web application. Measure first, optimize second, verify always.

## Optimization Framework

### Step 1: Measure Baseline
Before optimizing anything, establish measurable baselines:
- **Frontend:** Lighthouse score, LCP, FID, CLS (Core Web Vitals)
- **Backend:** p50/p95/p99 response times, throughput (req/sec)
- **Database:** Query execution time, connection pool utilization
- **Infrastructure:** CPU, memory, network I/O

### Step 2: Identify Bottleneck
Use profiling tools to find the actual bottleneck (do not guess):
- Chrome DevTools Performance tab for frontend
- Node.js --inspect or APM tools for backend
- EXPLAIN ANALYZE for database queries
- Load testing tools (k6, Artillery) for system-level

### Step 3: Optimize (by layer)

#### Frontend
- Lazy-load images and below-fold components
- Code-split routes with dynamic imports
- Minimize bundle size (tree-shaking, compression)
- Use efficient rendering (virtualized lists for large datasets)
- Cache static assets with proper Cache-Control headers
- Defer non-critical JavaScript and CSS

#### Backend
- Cache frequently accessed data (Redis, in-memory)
- Use connection pooling for database connections
- Implement pagination for list endpoints
- Process heavy work asynchronously (queues, background jobs)
- Avoid synchronous file I/O in request handlers
- Use streaming for large response bodies

#### Database
- Add indexes for frequently queried columns
- Avoid SELECT * (select only needed columns)
- Fix N+1 queries with JOINs or batch loading
- Use materialized views for complex aggregations
- Partition large tables by date or tenant
- Monitor and kill long-running queries

### Step 4: Verify Improvement
- Re-run the same benchmarks from Step 1
- Confirm improvement meets the target threshold
- Check for regressions in other metrics
- Document the change and its measured impact

## Best Practices
- Profile in production-like environments, not just locally
- Optimize the critical path first (what users wait for)
- Set performance budgets and monitor them in CI
- Prefer algorithmic improvements over micro-optimizations`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * BUSINESS & STRATEGY (4)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'market-analysis',
    name: 'Market Analysis',
    description:
      'Comprehensive market research framework covering size estimation, segmentation, trends, and competitive landscape.',
    category: 'business',
    tags: ['market-research', 'analysis', 'strategy', 'TAM'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'business',
    is_bundled: true,
    content: `# Market Analysis Framework

## Purpose
Conduct thorough market analysis to inform business strategy, product decisions, and investment priorities. Combines quantitative sizing with qualitative insight.

## Analysis Structure

### 1. Market Definition
- What problem does this market solve?
- Who are the buyers (B2B, B2C, B2B2C)?
- What is the geographic scope?
- What are the market boundaries (what is included and excluded)?

### 2. Market Sizing (TAM / SAM / SOM)
- **TAM (Total Addressable Market):** Total revenue opportunity if 100% market share achieved
- **SAM (Serviceable Addressable Market):** Portion of TAM you can realistically target
- **SOM (Serviceable Obtainable Market):** Realistic near-term capture (1-3 years)

Sizing Methods:
- **Top-down:** Start from industry reports, apply filters
- **Bottom-up:** Estimate per-customer revenue x number of potential customers
- **Value-theory:** Price based on value delivered vs. alternatives

### 3. Segmentation
Segment the market by:
- Demographics (company size, industry, geography)
- Behavior (usage patterns, buying triggers, price sensitivity)
- Needs (primary pain point, urgency, willingness to pay)
- Technology (tech stack, maturity, integration requirements)

### 4. Trends & Drivers
- What macro trends are accelerating or decelerating this market?
- Regulatory changes, technology shifts, demographic shifts
- Identify leading indicators that signal market direction
- Estimate the 3-year and 5-year trajectory

### 5. Competitive Landscape
- Map direct competitors (same solution, same customer)
- Map indirect competitors (different solution, same problem)
- Identify key differentiators and positioning gaps
- Assess barriers to entry and switching costs

## Output Template
\`\`\`
## Market Summary
- Market: [Name]
- TAM: $[X]B | SAM: $[X]M | SOM: $[X]M
- Growth Rate: [X]% CAGR
- Key Segments: [Segment A], [Segment B], [Segment C]
- Top 3 Competitors: [A], [B], [C]
- Key Insight: [One-sentence strategic takeaway]
\`\`\``,
  },
  {
    slug: 'financial-modeling',
    name: 'Financial Modeling',
    description:
      'Build revenue projections, unit economics, and scenario analysis models for startups and growth-stage companies.',
    category: 'business',
    tags: ['finance', 'modeling', 'projections', 'unit-economics'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'business',
    is_bundled: true,
    content: `# Financial Modeling

## Purpose
Build structured financial models that project revenue, costs, and profitability under different scenarios. Essential for fundraising, budgeting, and strategic planning.

## Model Components

### 1. Revenue Model
Choose the appropriate model:
- **SaaS:** MRR x 12, with churn and expansion
- **Marketplace:** GMV x take rate
- **Transactional:** Volume x price per transaction
- **Freemium:** Free users x conversion rate x ARPU

Key metrics to model:
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Average Revenue Per User (ARPU)
- Net Revenue Retention (NRR)
- Gross Revenue Churn

### 2. Unit Economics
\`\`\`
CAC (Customer Acquisition Cost) = Total S&M Spend / New Customers
LTV (Lifetime Value) = ARPU x Gross Margin / Monthly Churn Rate
LTV:CAC Ratio = LTV / CAC  (target: >3x)
CAC Payback = CAC / (ARPU x Gross Margin)  (target: <12 months)
\`\`\`

### 3. Cost Structure
- **COGS:** Hosting, API costs, support, onboarding
- **R&D:** Engineering salaries, tools, contractors
- **S&M:** Ads, sales team, content, events
- **G&A:** Legal, accounting, office, insurance

### 4. Scenario Analysis
Build three scenarios:
- **Conservative:** Low growth, high churn, compressed margins
- **Base:** Realistic growth based on current trajectory
- **Optimistic:** Accelerated growth, viral adoption, pricing power

### 5. Key Outputs
- Monthly P&L for 24 months
- Annual P&L for 5 years
- Cash flow and runway calculation
- Break-even analysis
- Sensitivity table (revenue vs. key variable)

## Output Format
| Metric | Month 1 | Month 6 | Month 12 | Month 24 |
|--------|---------|---------|----------|----------|
| MRR | $X | $X | $X | $X |
| Customers | X | X | X | X |
| CAC | $X | $X | $X | $X |
| LTV:CAC | X:1 | X:1 | X:1 | X:1 |
| Burn Rate | $X | $X | $X | $X |
| Runway | Xmo | Xmo | Xmo | Xmo |

## Best Practices
- Always state your assumptions explicitly
- Use conservative estimates for revenue, aggressive for costs
- Update the model monthly with actuals vs. projections
- Include a sensitivity analysis for the top 3 variables`,
  },
  {
    slug: 'competitive-analysis',
    name: 'Competitive Analysis',
    description:
      'Map the competitive landscape with feature comparison, positioning analysis, and strategic differentiation recommendations.',
    category: 'business',
    tags: ['competition', 'analysis', 'strategy', 'positioning'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'business',
    is_bundled: true,
    content: `# Competitive Analysis

## Purpose
Understand the competitive landscape to identify opportunities for differentiation, anticipate competitor moves, and inform product and go-to-market strategy.

## Analysis Framework

### 1. Competitor Identification
- **Direct competitors:** Same solution, same target customer
- **Indirect competitors:** Different solution, same problem
- **Potential entrants:** Companies that could easily enter this space
- **Substitutes:** Manual processes or workarounds customers use today

### 2. Competitor Profile (per competitor)
\`\`\`
Company: [Name]
Founded: [Year] | Funding: $[X]M | Employees: ~[X]
Target Market: [Description]
Pricing: [Model and range]
Key Differentiator: [One sentence]
Strengths: [2-3 bullet points]
Weaknesses: [2-3 bullet points]
Recent Moves: [Product launches, partnerships, funding rounds]
\`\`\`

### 3. Feature Comparison Matrix
| Feature | Us | Competitor A | Competitor B | Competitor C |
|---------|-----|-------------|-------------|-------------|
| Feature 1 | Yes/Partial/No | | | |
| Feature 2 | | | | |
| Pricing | | | | |
| Support | | | | |
| Integrations | | | | |

### 4. Positioning Map
Plot competitors on a 2x2 matrix using the two most important dimensions:
- Example axes: Price vs. Completeness, Ease-of-use vs. Power
- Identify white space (underserved quadrants)
- Determine your current position and desired position

### 5. Strategic Implications
- Where can we win? (segments, use cases, geographies)
- What should we avoid? (competitor strongholds, price wars)
- What is our moat? (technology, data, network effects, brand)
- What are the biggest threats? (well-funded competitors, market shifts)

## Deliverable
A competitive brief with:
1. Landscape overview (2-3 paragraphs)
2. Top 5 competitor profiles
3. Feature comparison matrix
4. Positioning map
5. Strategic recommendations (3-5 actionable items)

## Best Practices
- Revisit quarterly as the landscape shifts fast
- Use primary data (competitor product trials, customer interviews) not just secondary research
- Be honest about competitor strengths; underestimating competitors leads to bad strategy
- Focus on differentiation that matters to customers, not just technical features`,
  },
  {
    slug: 'swot-analysis',
    name: 'SWOT Analysis',
    description:
      'Structured strengths-weaknesses-opportunities-threats analysis for strategic planning and decision-making.',
    category: 'business',
    tags: ['swot', 'strategy', 'planning', 'assessment'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'business',
    is_bundled: true,
    content: `# SWOT Analysis

## Purpose
Evaluate an organization, product, or initiative through four lenses: Strengths, Weaknesses, Opportunities, and Threats. This structured framework ensures balanced assessment and drives actionable strategy.

## Framework

### Internal Factors

#### Strengths (What we do well)
Questions to ask:
- What unique resources or capabilities do we have?
- What do customers say we do better than competitors?
- What processes or technologies give us an advantage?
- What is our team's unique expertise?

Format each strength as:
\`\`\`
Strength: [Name]
Evidence: [Data point or example that proves this]
Leverage: [How to amplify this advantage]
\`\`\`

#### Weaknesses (Where we fall short)
Questions to ask:
- What do competitors do better than us?
- Where do we lose deals or customers?
- What capabilities are we missing?
- What internal processes cause friction?

Format each weakness as:
\`\`\`
Weakness: [Name]
Impact: [How this affects the business]
Mitigation: [Plan to address or minimize]
\`\`\`

### External Factors

#### Opportunities (External trends we can exploit)
Questions to ask:
- What market trends favor our strengths?
- Are there underserved segments we can reach?
- What technology changes create new possibilities?
- Are there partnership or acquisition opportunities?

#### Threats (External risks we must prepare for)
Questions to ask:
- What are competitors planning?
- What regulatory or economic changes could hurt us?
- Are customer needs or expectations shifting?
- What technology disruptions could make us obsolete?

## Strategic Actions Matrix
| | Opportunities | Threats |
|---|---|---|
| **Strengths** | SO: Use strengths to capture opportunities | ST: Use strengths to defend against threats |
| **Weaknesses** | WO: Address weaknesses to unlock opportunities | WT: Minimize weaknesses and avoid threats |

## Output Template
\`\`\`
## SWOT: [Subject]

### Strengths
1. [Strength with evidence]
2. [Strength with evidence]

### Weaknesses
1. [Weakness with impact]
2. [Weakness with impact]

### Opportunities
1. [Opportunity with timeline]
2. [Opportunity with timeline]

### Threats
1. [Threat with likelihood and impact]
2. [Threat with likelihood and impact]

### Priority Actions
1. [Action] — leverages [S1] to capture [O2]
2. [Action] — mitigates [W1] before [T1] materializes
\`\`\``,
  },
  {
    slug: 'stakeholder-communication',
    name: 'Stakeholder Communication',
    description:
      'Templates and frameworks for executive updates, board reports, and cross-functional stakeholder communication.',
    category: 'business',
    tags: ['communication', 'stakeholders', 'reporting', 'executive'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'business',
    is_bundled: true,
    content: `# Stakeholder Communication

## Purpose
Communicate effectively with different stakeholder groups by tailoring message content, format, and frequency to each audience's needs and decision-making context.

## Stakeholder Mapping

### Step 1: Identify Stakeholders
Map all stakeholders on a Power/Interest grid:
- **High Power, High Interest:** Manage closely (executives, key clients)
- **High Power, Low Interest:** Keep satisfied (board members, regulators)
- **Low Power, High Interest:** Keep informed (team members, users)
- **Low Power, Low Interest:** Monitor (general public, peripheral teams)

### Step 2: Define Communication Plan
For each stakeholder group, define:
- **What:** Key messages and metrics they care about
- **How:** Format (email, deck, dashboard, meeting)
- **When:** Frequency (daily, weekly, monthly, quarterly)
- **Who:** Responsible communicator

## Communication Templates

### Executive Summary (for C-suite)
\`\`\`
Subject: [Project/Initiative] — [Status: On Track / At Risk / Blocked]

**Bottom Line:** [One sentence: what happened and what it means]

**Key Metrics:**
- [Metric 1]: [Value] ([trend] vs. last period)
- [Metric 2]: [Value] ([trend] vs. target)

**Decisions Needed:**
1. [Decision with options and recommendation]

**Next Steps:**
- [Action] — [Owner] — [Deadline]
\`\`\`

### Status Update (for cross-functional teams)
\`\`\`
## Weekly Update: [Project Name]
**Period:** [Date range]

### Completed This Week
- [Accomplishment with impact]

### In Progress
- [Task] — [% complete] — [ETA]

### Blockers
- [Blocker] — [Owner] — [Help needed]

### Next Week Plan
- [Priority 1]
- [Priority 2]
\`\`\`

### Escalation (for urgent issues)
\`\`\`
**ESCALATION: [Issue Title]**
**Severity:** [Critical/High/Medium]
**Impact:** [Who is affected and how]
**Root Cause:** [Known/Investigating]
**Current Status:** [What has been done]
**Ask:** [Specific help or decision needed]
**Deadline:** [When the decision is needed by]
\`\`\`

## Best Practices
- Lead with the conclusion, not the background
- Tailor detail level to the audience (executives want outcomes, engineers want specifics)
- Use data and evidence, not opinions
- Always include clear next steps with owners and deadlines
- Bad news travels best when paired with a mitigation plan
- Over-communicate during crises, under-communicate during stability`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * CONTENT & MARKETING (3)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'seo-content-strategy',
    name: 'SEO Content Strategy',
    description:
      'Plan and execute search-engine-optimized content with keyword research, topic clusters, and on-page optimization.',
    category: 'content',
    tags: ['seo', 'content', 'keywords', 'organic-traffic'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'article',
    is_bundled: true,
    content: `# SEO Content Strategy

## Purpose
Create a systematic content strategy that drives organic search traffic by targeting high-intent keywords, building topical authority, and optimizing on-page elements.

## Strategy Framework

### 1. Keyword Research
- Identify seed keywords from business goals and customer language
- Expand using tools (Ahrefs, SEMrush, Google Keyword Planner, or free alternatives)
- Classify keywords by intent:
  - **Informational:** "how to", "what is", "guide to"
  - **Navigational:** Brand or product names
  - **Commercial:** "best", "review", "comparison", "vs"
  - **Transactional:** "buy", "pricing", "sign up", "demo"
- Prioritize by: search volume x relevance x difficulty

### 2. Topic Clusters
Build pillar + cluster architecture:
\`\`\`
Pillar Page: [Broad topic, 2000+ words]
  |- Cluster: [Subtopic 1, 800-1200 words]
  |- Cluster: [Subtopic 2, 800-1200 words]
  |- Cluster: [Subtopic 3, 800-1200 words]
  |- Cluster: [FAQ / How-to, 600-1000 words]
\`\`\`
Internal linking between clusters and pillar is critical.

### 3. On-Page Optimization Checklist
- [ ] Title tag: Primary keyword + compelling hook (< 60 chars)
- [ ] Meta description: Value proposition + CTA (< 155 chars)
- [ ] H1: Contains primary keyword, matches search intent
- [ ] H2/H3: Include secondary keywords and questions
- [ ] URL slug: Short, keyword-rich, lowercase, hyphenated
- [ ] First paragraph: Primary keyword within first 100 words
- [ ] Images: Descriptive alt text, compressed file size
- [ ] Internal links: 3-5 links to related content
- [ ] External links: 1-2 links to authoritative sources
- [ ] Schema markup: FAQ, HowTo, or Article as appropriate

### 4. Content Calendar
| Week | Topic | Keyword | Volume | Difficulty | Type | Status |
|------|-------|---------|--------|-----------|------|--------|
| 1 | [Topic] | [Keyword] | [X] | [Low/Med/High] | [Blog/Guide/Video] | Draft |

### 5. Measurement
Track monthly:
- Organic sessions and page views
- Keyword rankings (target top 10)
- Click-through rate from SERP
- Time on page and bounce rate
- Conversions from organic traffic

## Best Practices
- Update existing content before creating new (refresh beats volume)
- Target long-tail keywords for new sites (lower competition)
- Write for humans first, optimize for search second
- Build backlinks through original research, data, and guest posts`,
  },
  {
    slug: 'social-media-calendar',
    name: 'Social Media Calendar',
    description:
      'Plan, schedule, and track social media content across platforms with consistent themes and engagement strategies.',
    category: 'content',
    tags: ['social-media', 'calendar', 'content-planning', 'engagement'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'article',
    is_bundled: true,
    content: `# Social Media Calendar

## Purpose
Maintain a consistent, strategic social media presence with planned content themes, platform-specific formatting, and measurable engagement goals.

## Calendar Structure

### Weekly Content Mix (recommended ratio)
- **40% Value:** Educational content, tips, how-tos, industry insights
- **30% Engagement:** Questions, polls, user-generated content, conversations
- **20% Promotion:** Product features, case studies, offers, launches
- **10% Culture:** Behind-the-scenes, team highlights, company values

### Platform-Specific Guidelines

#### LinkedIn
- Post frequency: 3-5x per week
- Best times: Tue-Thu, 8-10am and 12-1pm
- Format: Text posts (1300+ chars perform best), carousels, documents
- Tone: Professional, insightful, thought leadership

#### Twitter / X
- Post frequency: 1-3x per day
- Best times: Mon-Fri, 9am and 12pm
- Format: Short threads (3-7 tweets), images, polls
- Tone: Concise, conversational, timely

#### Instagram
- Post frequency: 3-5x per week (feed), daily (stories)
- Best times: Mon/Wed/Fri, 11am-1pm
- Format: Carousels, reels, stories with polls/questions
- Tone: Visual, authentic, community-focused

### Monthly Calendar Template
| Date | Platform | Content Type | Topic | Copy | Media | CTA | Status |
|------|----------|-------------|-------|------|-------|-----|--------|
| Mon | LinkedIn | Value | [Topic] | [Draft] | [Image/Video] | [Link/Comment] | Scheduled |
| Tue | Twitter | Engagement | [Topic] | [Draft] | [Image] | [Reply/Poll] | Draft |
| Wed | Instagram | Culture | [Topic] | [Draft] | [Carousel] | [DM/Link] | Idea |

### Content Pillars
Define 4-5 recurring themes:
1. **Industry Expertise:** Trends, analysis, predictions
2. **Product Value:** Features, use cases, tips
3. **Customer Stories:** Testimonials, case studies, UGC
4. **Team & Culture:** Hiring, events, values
5. **Thought Leadership:** Founder insights, hot takes, lessons learned

## Measurement (Monthly)
- Impressions and reach per platform
- Engagement rate (likes + comments + shares / impressions)
- Click-through rate to website
- Follower growth rate
- Top-performing posts (analyze why they worked)

## Best Practices
- Batch content creation (dedicate one day to creating a week's content)
- Repurpose across platforms (blog post -> tweet thread -> carousel)
- Engage in comments within 1 hour of posting
- Use scheduling tools (Buffer, Hootsuite, or native schedulers)
- A/B test post formats and times quarterly`,
  },
  {
    slug: 'email-marketing-sequences',
    name: 'Email Marketing Sequences',
    description:
      'Design automated email sequences for onboarding, nurture, re-engagement, and sales with optimized copy and timing.',
    category: 'content',
    tags: ['email', 'marketing', 'automation', 'sequences', 'nurture'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'article',
    is_bundled: true,
    content: `# Email Marketing Sequences

## Purpose
Design automated email sequences that guide prospects and customers through key journeys: onboarding, nurture, conversion, and re-engagement. Each sequence is goal-oriented with measurable conversion points.

## Sequence Types

### 1. Welcome / Onboarding (trigger: signup)
| Email | Timing | Subject Formula | Goal |
|-------|--------|----------------|------|
| 1 | Immediate | Welcome to [Product] — here's your first step | Activate: complete setup |
| 2 | Day 2 | Quick win: [achieve X] in 5 minutes | Engage: use core feature |
| 3 | Day 4 | 3 tips from power users | Educate: discover advanced features |
| 4 | Day 7 | How [Customer] achieved [Result] | Social proof: see value |
| 5 | Day 14 | You're missing out on [Feature] | Convert: upgrade or complete profile |

### 2. Nurture (trigger: downloaded content / attended webinar)
| Email | Timing | Subject Formula | Goal |
|-------|--------|----------------|------|
| 1 | Immediate | Your [resource] is ready | Deliver: provide value |
| 2 | Day 3 | Related: [complementary content] | Engage: deepen interest |
| 3 | Day 7 | How [Company] solved [Problem] | Social proof |
| 4 | Day 14 | Ready to see it in action? | Convert: book demo |

### 3. Re-engagement (trigger: 30 days inactive)
| Email | Timing | Subject Formula | Goal |
|-------|--------|----------------|------|
| 1 | Day 0 | We miss you, [Name] | Re-activate |
| 2 | Day 5 | What's new since you left | Inform: show improvements |
| 3 | Day 10 | Special offer: [incentive] | Convert: win back |
| 4 | Day 15 | Last chance before we part ways | Urgency: final attempt |

## Email Copy Framework
\`\`\`
Subject: [Curiosity/Benefit] — [Specificity]
Preview: [Expand on subject, add context]

Hi [First Name],

[Opening hook: question, stat, or relatable problem — 1-2 sentences]

[Value section: main content, tips, story — 3-5 sentences]

[CTA: single, clear action]
[Button: Action Verb + Benefit]

[Sign-off]
[Name, Title]

P.S. [Reinforce CTA or add secondary offer]
\`\`\`

## Key Metrics
- **Open rate:** Target >25% (optimize subject lines)
- **Click rate:** Target >3% (optimize CTA and content relevance)
- **Conversion rate:** Target >1% (optimize offer and landing page)
- **Unsubscribe rate:** Keep <0.5% (optimize frequency and relevance)

## Best Practices
- One CTA per email (not three)
- Mobile-first design (>60% of emails opened on mobile)
- Personalize beyond [First Name] (use behavior, segment, and stage)
- A/B test subject lines on 20% of list before full send
- Set up proper SPF, DKIM, and DMARC for deliverability
- Always include a plain-text version`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * DATA & ANALYTICS (2)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'data-analysis-pipeline',
    name: 'Data Analysis Pipeline',
    description:
      'Structured data analysis workflow from collection and cleaning through exploration, modeling, and visualization.',
    category: 'data',
    tags: ['data', 'analysis', 'pipeline', 'visualization', 'ETL'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'analytics',
    is_bundled: true,
    content: `# Data Analysis Pipeline

## Purpose
Execute a structured data analysis workflow that transforms raw data into actionable insights. This pipeline ensures reproducibility, quality, and clear communication of findings.

## Pipeline Stages

### Stage 1: Define the Question
Before touching any data:
- What business question are we answering?
- What decisions will this analysis inform?
- What would a useful answer look like?
- What data do we need and where does it live?

### Stage 2: Data Collection
- Identify data sources (database, API, CSV, logs)
- Document data provenance and freshness
- Extract data with reproducible queries/scripts
- Store raw data separately from processed data

### Stage 3: Data Cleaning
Common cleaning tasks:
- [ ] Remove duplicates
- [ ] Handle missing values (drop, impute, or flag)
- [ ] Fix data types (strings to dates, strings to numbers)
- [ ] Standardize formats (date formats, currency, units)
- [ ] Remove outliers (document criteria and reasoning)
- [ ] Validate ranges and constraints

Quality checks:
\`\`\`
Row count: [X] (expected: [Y])
Null percentage per column: [list]
Duplicate rows: [X]
Date range: [min] to [max]
\`\`\`

### Stage 4: Exploratory Analysis
- Compute summary statistics (mean, median, std, min, max)
- Visualize distributions (histograms, box plots)
- Check correlations between variables
- Identify patterns, clusters, and anomalies
- Form hypotheses based on observations

### Stage 5: Deep Analysis
Depending on the question:
- **Descriptive:** What happened? (aggregations, trends, comparisons)
- **Diagnostic:** Why did it happen? (drill-downs, cohort analysis, root cause)
- **Predictive:** What will happen? (regression, classification, time series)
- **Prescriptive:** What should we do? (optimization, simulation, A/B test design)

### Stage 6: Communicate Results
Structure your report:
1. **Executive Summary:** Key finding in one sentence
2. **Methodology:** Data sources, cleaning steps, analysis approach
3. **Findings:** Visualizations with clear titles and annotations
4. **Recommendations:** Specific actions based on findings
5. **Appendix:** Detailed tables, code references, assumptions

## Best Practices
- Version control your analysis code
- Document every transformation and its rationale
- Use reproducible notebooks (Jupyter, Observable)
- Separate data extraction, transformation, and visualization
- Always include confidence intervals or uncertainty measures
- Review findings with domain experts before presenting`,
  },
  {
    slug: 'report-generation',
    name: 'Report Generation',
    description:
      'Generate structured business reports with executive summaries, KPI dashboards, and data-driven recommendations.',
    category: 'data',
    tags: ['reports', 'dashboards', 'KPI', 'business-intelligence'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'analytics',
    is_bundled: true,
    content: `# Report Generation

## Purpose
Create clear, actionable business reports that transform data into decisions. Reports should be scannable by executives and detailed enough for analysts.

## Report Structure

### 1. Header
\`\`\`
Report: [Title]
Period: [Date range]
Author: [Name / Agent]
Distribution: [Audience]
Classification: [Internal / Confidential]
\`\`\`

### 2. Executive Summary (read in 30 seconds)
- **Status:** [On Track / Needs Attention / Critical]
- **Key Metric:** [Primary KPI] = [Value] ([+/-X%] vs. target)
- **Top Insight:** [One sentence — the most important finding]
- **Recommended Action:** [One sentence — what to do next]

### 3. KPI Dashboard
| KPI | Current | Target | Trend | Status |
|-----|---------|--------|-------|--------|
| Revenue | $X | $Y | +X% | On Track |
| Active Users | X | Y | +X% | At Risk |
| Churn Rate | X% | <Y% | -X% | On Track |
| NPS | X | >Y | +X | Improving |
| Support Tickets | X | <Y | +X% | Needs Attention |

Color code: Green (on track), Yellow (at risk), Red (off track)

### 4. Analysis Sections
For each key area:
\`\`\`
## [Section Title]

**What happened:** [Factual description with data]
**Why it matters:** [Business impact]
**Root cause:** [Analysis of underlying drivers]
**Recommendation:** [Specific action with owner and deadline]
\`\`\`

### 5. Trends & Forecasts
- Month-over-month and year-over-year comparisons
- Trendlines with projections (linear, seasonal adjusted)
- Leading indicators and their implications

### 6. Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
| [Risk] | High/Med/Low | High/Med/Low | [Plan] | [Name] |

### 7. Next Steps
- [ ] [Action item] — [Owner] — [Deadline]
- [ ] [Action item] — [Owner] — [Deadline]

## Report Types by Frequency

### Daily
- Key operational metrics only
- Anomaly flags (anything outside 2 standard deviations)
- Format: Dashboard or short email

### Weekly
- Progress against OKRs
- Completed items and blockers
- Format: 1-page summary

### Monthly
- Full KPI review with trends
- Deep-dive on one focus area
- Format: Structured report (this template)

### Quarterly
- Strategic review with executive summary
- Market context and competitive updates
- Format: Presentation deck + written report

## Best Practices
- Automate data collection (do not manually copy numbers)
- Include comparisons (vs. target, vs. last period, vs. benchmark)
- Use consistent formatting across all reports
- Highlight exceptions and anomalies, not just averages
- End every section with a clear "so what" and "now what"`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * OPERATIONS & PM (4)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'project-risk-assessment',
    name: 'Project Risk Assessment',
    description:
      'Identify, evaluate, and plan mitigations for project risks using probability-impact matrices and contingency planning.',
    category: 'ops',
    tags: ['risk', 'assessment', 'project-management', 'mitigation'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'settings',
    is_bundled: true,
    content: `# Project Risk Assessment

## Purpose
Proactively identify, evaluate, and mitigate project risks before they become problems. This framework ensures nothing is overlooked and resources are allocated to the highest-impact risks.

## Risk Assessment Process

### Step 1: Risk Identification
Brainstorm risks across all dimensions:
- **Technical:** Technology failures, integration issues, scalability limits
- **Resource:** Key person dependency, skill gaps, budget overruns
- **Schedule:** Deadline pressure, dependency delays, scope creep
- **External:** Vendor reliability, regulatory changes, market shifts
- **Organizational:** Stakeholder alignment, priority changes, restructuring

Techniques:
- Pre-mortem: "Imagine the project failed — what went wrong?"
- Checklist review: Walk through common risk categories
- Expert interviews: Ask experienced team members
- Historical analysis: What went wrong on similar past projects?

### Step 2: Risk Evaluation
Rate each risk on two dimensions:

**Probability:** How likely is this risk to occur?
- 1 = Very unlikely (<10%)
- 2 = Unlikely (10-25%)
- 3 = Possible (25-50%)
- 4 = Likely (50-75%)
- 5 = Very likely (>75%)

**Impact:** If it occurs, how severe is the effect?
- 1 = Negligible (minor inconvenience)
- 2 = Minor (workaround available)
- 3 = Moderate (significant delay or cost)
- 4 = Major (project objectives at risk)
- 5 = Critical (project failure)

**Risk Score** = Probability x Impact

### Step 3: Risk Matrix
|  | Impact 1 | Impact 2 | Impact 3 | Impact 4 | Impact 5 |
|---|---|---|---|---|---|
| **Prob 5** | 5 | 10 | 15 | 20 | 25 |
| **Prob 4** | 4 | 8 | 12 | 16 | 20 |
| **Prob 3** | 3 | 6 | 9 | 12 | 15 |
| **Prob 2** | 2 | 4 | 6 | 8 | 10 |
| **Prob 1** | 1 | 2 | 3 | 4 | 5 |

- **Red (15-25):** Immediate action required
- **Yellow (8-14):** Mitigation plan required
- **Green (1-7):** Monitor and accept

### Step 4: Mitigation Planning
For each Red and Yellow risk:
\`\`\`
Risk: [Description]
Score: [Probability] x [Impact] = [Score]
Strategy: [Avoid / Mitigate / Transfer / Accept]
Mitigation: [Specific actions to reduce probability or impact]
Contingency: [Plan B if the risk materializes]
Owner: [Name]
Trigger: [How we will know the risk is materializing]
\`\`\`

### Step 5: Monitor & Review
- Review risk register weekly during project standup
- Update scores as new information emerges
- Close risks that are no longer relevant
- Add new risks as they are identified
- Escalate risks that cross the Red threshold

## Best Practices
- Involve the whole team in risk identification (not just the PM)
- Be specific: "database migration takes >4 hours" not "technical issues"
- Assign a single owner per risk (shared ownership means no ownership)
- Track risk trends over time (are we getting better at managing risks?)
- Celebrate risks that were successfully mitigated`,
  },
  {
    slug: 'sprint-planning',
    name: 'Sprint Planning',
    description:
      'Structure sprint planning sessions with capacity estimation, story breakdown, commitment tracking, and velocity analysis.',
    category: 'ops',
    tags: ['agile', 'sprint', 'planning', 'scrum', 'velocity'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'settings',
    is_bundled: true,
    content: `# Sprint Planning

## Purpose
Plan a focused, achievable sprint by matching team capacity to prioritized work. Good sprint planning reduces mid-sprint chaos and improves delivery predictability.

## Planning Process

### Pre-Planning (before the meeting)
- [ ] Product backlog is groomed and prioritized
- [ ] Top 15-20 stories have acceptance criteria
- [ ] Stories are estimated (story points or T-shirt sizes)
- [ ] Team availability is known (vacations, on-call, meetings)
- [ ] Previous sprint retro action items are incorporated

### Step 1: Review Capacity
\`\`\`
Sprint Duration: [X] days
Team Members: [N]
Available Days: [Total person-days minus PTO, on-call, meetings]
Historical Velocity: [Average story points per sprint over last 3 sprints]
Planned Capacity: [X] story points (velocity x focus factor)
\`\`\`

Focus factor (typical): 0.6-0.8 of theoretical capacity
- 0.6 for new teams or heavy meeting load
- 0.7 for established teams
- 0.8 for experienced teams with minimal interruptions

### Step 2: Select Stories
Starting from the top of the prioritized backlog:
1. Product Owner presents the story and acceptance criteria
2. Team discusses implementation approach
3. Team confirms or adjusts the estimate
4. Team decides if it fits within remaining capacity
5. Repeat until capacity is filled

### Step 3: Break Down Tasks
For each committed story:
\`\`\`
Story: [Title] — [Points]
Tasks:
  - [ ] [Task 1] — [Owner] — [Hours estimate]
  - [ ] [Task 2] — [Owner] — [Hours estimate]
  - [ ] [Task 3: Tests] — [Owner] — [Hours estimate]
  - [ ] [Task 4: Review] — [Owner] — [Hours estimate]
Definition of Done:
  - [ ] Code reviewed and approved
  - [ ] Tests passing (unit + integration)
  - [ ] Documentation updated
  - [ ] Deployed to staging and verified
\`\`\`

### Step 4: Sprint Goal
Write a single sentence that captures the sprint's theme:
"By the end of this sprint, [user/system] will be able to [capability] so that [value]."

### Sprint Board Setup
| To Do | In Progress | In Review | Done |
|-------|-------------|-----------|------|
| [Stories] | | | |

## Velocity Tracking
| Sprint | Committed | Completed | Velocity | Notes |
|--------|-----------|-----------|----------|-------|
| S-1 | X pts | Y pts | Y | [Context] |
| S-2 | X pts | Y pts | Y | [Context] |
| S-3 | X pts | Y pts | Y | [Context] |
| **Avg** | | | **Y** | |

## Best Practices
- Never commit to more than your average velocity
- Include a buffer (10-15%) for unplanned work and bugs
- Every story must have a clear Definition of Done
- If a story cannot be completed in one sprint, break it down further
- The team commits, not the PM (commitment = team confidence)
- Time-box planning to 2 hours per 2-week sprint`,
  },
  {
    slug: 'documentation-standards',
    name: 'Documentation Standards',
    description:
      'Establish consistent documentation practices for code, APIs, processes, and architectural decisions.',
    category: 'ops',
    tags: ['documentation', 'standards', 'knowledge-base', 'ADR'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'settings',
    is_bundled: true,
    content: `# Documentation Standards

## Purpose
Establish consistent documentation practices that reduce onboarding time, prevent knowledge silos, and make systems maintainable. Documentation is a product — treat it with the same care as code.

## Documentation Types

### 1. Code Documentation
**Inline comments** — explain "why", not "what":
\`\`\`javascript
// BAD: Increment counter by 1
counter += 1;

// GOOD: Retry count tracks consecutive failures for circuit breaker threshold
counter += 1;
\`\`\`

**Function/method documentation:**
\`\`\`javascript
/**
 * Calculate the prorated subscription price for a mid-cycle upgrade.
 *
 * @param {number} currentPlanPrice - Monthly price of the current plan
 * @param {number} newPlanPrice - Monthly price of the new plan
 * @param {number} daysRemaining - Days left in the current billing cycle
 * @param {number} totalDays - Total days in the current billing cycle
 * @returns {number} The prorated amount to charge (always >= 0)
 * @throws {Error} If newPlanPrice <= currentPlanPrice (not an upgrade)
 */
\`\`\`

### 2. API Documentation
For every endpoint:
\`\`\`
## POST /api/v1/orders

Create a new order for the authenticated user.

### Request
Headers: Authorization: Bearer <token>
Body:
{
  "items": [{ "product_id": "string", "quantity": number }],
  "shipping_address_id": "string"
}

### Response (201)
{
  "id": "ord_abc123",
  "status": "pending",
  "total": 49.99,
  "created_at": "2025-01-15T10:00:00Z"
}

### Errors
- 400: Missing required fields
- 401: Invalid or expired token
- 422: Product out of stock
\`\`\`

### 3. Architecture Decision Records (ADR)
\`\`\`
# ADR-001: Use PostgreSQL for primary data store

## Status: Accepted
## Date: 2025-01-15

## Context
We need a primary database that supports complex queries,
transactions, and JSON data types.

## Decision
We will use PostgreSQL via Supabase.

## Consequences
- (+) Strong ACID guarantees
- (+) Native JSON support
- (+) Supabase provides auth and real-time
- (-) Requires connection pooling for serverless
- (-) Learning curve for team members from NoSQL background
\`\`\`

### 4. Runbooks
For every operational procedure:
\`\`\`
# Runbook: Database Migration

## When to use
When deploying a new migration to production.

## Prerequisites
- [ ] Migration tested locally and in staging
- [ ] Database backup completed (< 1 hour old)
- [ ] On-call engineer notified

## Steps
1. [Exact command with placeholders]
2. [Verification step]
3. [Rollback step if verification fails]

## Rollback
[Exact steps to undo the change]
\`\`\`

## Best Practices
- Write docs when you build (not after, when you have forgotten details)
- Keep docs next to the code they describe (colocate, do not centralize)
- Review docs in PRs just like code
- Delete stale docs (wrong docs are worse than no docs)
- Use templates to ensure consistency
- Link between related documents`,
  },
  {
    slug: 'meeting-summary',
    name: 'Meeting Summary',
    description:
      'Generate structured meeting summaries with decisions, action items, and follow-up tracking.',
    category: 'ops',
    tags: ['meetings', 'summary', 'action-items', 'notes'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'settings',
    is_bundled: true,
    content: `# Meeting Summary

## Purpose
Transform meeting discussions into structured, actionable summaries that capture decisions, action items, and context. A good meeting summary makes the meeting useful even for people who did not attend.

## Summary Template

\`\`\`
# Meeting: [Title]
**Date:** [YYYY-MM-DD] | **Time:** [HH:MM - HH:MM] | **Duration:** [Xmin]
**Attendees:** [Name 1], [Name 2], [Name 3]
**Absent:** [Name 4] (informed)
**Facilitator:** [Name] | **Note-taker:** [Name]

## Purpose
[One sentence: why this meeting was held]

## Key Decisions
1. **[Decision]** — Decided by [consensus/vote/authority]
   - Context: [Brief rationale]
   - Dissenting view: [If any, and from whom]

2. **[Decision]** — Decided by [method]
   - Context: [Brief rationale]

## Action Items
| # | Action | Owner | Deadline | Status |
|---|--------|-------|----------|--------|
| 1 | [Specific task] | [Name] | [Date] | Open |
| 2 | [Specific task] | [Name] | [Date] | Open |
| 3 | [Specific task] | [Name] | [Date] | Open |

## Discussion Summary
### Topic 1: [Title]
- [Key point discussed]
- [Different perspectives raised]
- [Conclusion or next step]

### Topic 2: [Title]
- [Key point discussed]
- [Outcome]

## Open Questions
- [Question that was not resolved, with owner to investigate]

## Next Meeting
**Date:** [Date] | **Agenda:** [Key topics]
\`\`\`

## Capturing Techniques

### During the Meeting
- Focus on decisions and action items (not every word said)
- Use shorthand: capture WHO said WHAT about WHICH topic
- Flag unclear items with [?] to clarify before sending
- Record disagreements and their resolution

### After the Meeting (within 2 hours)
1. Clean up raw notes into the template
2. Verify action items have clear owners and deadlines
3. Add context that was obvious in the room but not in the notes
4. Send to all attendees and absent stakeholders
5. Add action items to project management tool

## Best Practices
- Send the summary within 2 hours while memory is fresh
- Every action item must have exactly one owner and a deadline
- Separate decisions from discussions (readers scan for decisions first)
- Use bullet points, not paragraphs
- Include enough context that someone who was not in the meeting understands the decision
- If no decisions were made, question whether the meeting was necessary
- Link to any documents, designs, or data referenced in the meeting`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   * CREATIVE & DESIGN (2)
   * ──────────────────────────────────────────────────────────────────────── */
  {
    slug: 'customer-journey-mapping',
    name: 'Customer Journey Mapping',
    description:
      'Map the end-to-end customer experience across touchpoints, identifying pain points and opportunities for improvement.',
    category: 'creative',
    tags: ['customer-experience', 'journey-map', 'UX', 'touchpoints'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'lightbulb',
    is_bundled: true,
    content: `# Customer Journey Mapping

## Purpose
Visualize the complete customer experience from first awareness through long-term retention. Journey maps reveal pain points, drop-off risks, and opportunities to delight customers at every stage.

## Journey Stages

### 1. Awareness
How customers first learn about the product:
- Channels: Search, social media, referrals, ads, content
- Customer mindset: "I have a problem and I'm looking for solutions"
- Key question: How easy is it to find us?

### 2. Consideration
How customers evaluate the product:
- Touchpoints: Website, demo, free trial, reviews, competitors
- Customer mindset: "Is this the right solution for me?"
- Key question: Do we clearly communicate our value proposition?

### 3. Acquisition
How customers make the purchase decision:
- Touchpoints: Pricing page, checkout, signup flow
- Customer mindset: "I'm ready to buy if the process is easy"
- Key question: Are there unnecessary friction points?

### 4. Onboarding
How customers start using the product:
- Touchpoints: Welcome email, setup wizard, documentation, first use
- Customer mindset: "I need to see value quickly or I'll leave"
- Key question: How fast is time-to-first-value?

### 5. Usage & Engagement
How customers interact with the product day-to-day:
- Touchpoints: Core features, support, updates, community
- Customer mindset: "Does this keep solving my problem?"
- Key question: Are customers using the features that drive retention?

### 6. Retention & Advocacy
How customers stay and refer others:
- Touchpoints: Renewal, upsell, NPS survey, referral program
- Customer mindset: "Is this still worth it? Would I recommend it?"
- Key question: What drives loyalty and word-of-mouth?

## Journey Map Template
For each stage, document:

| Stage | Touchpoints | Actions | Thoughts | Emotions | Pain Points | Opportunities |
|-------|-------------|---------|----------|----------|-------------|---------------|
| Awareness | [List] | [What they do] | [What they think] | [Happy/Neutral/Frustrated] | [Friction] | [Improvement] |
| Consideration | | | | | | |
| Acquisition | | | | | | |
| Onboarding | | | | | | |
| Usage | | | | | | |
| Retention | | | | | | |

## Emotion Curve
Plot customer emotional state across the journey:
\`\`\`
Delighted  |          *              *
Happy      |    *          *    *
Neutral    | *                         *
Frustrated |        *
Angry      |
           |________________________
             Aware  Consider  Buy  Onboard  Use  Renew
\`\`\`

## Analysis Output
For each pain point identified:
\`\`\`
Pain Point: [Description]
Stage: [Where in the journey]
Impact: [How many customers affected, severity]
Root Cause: [Why it happens]
Fix: [Proposed improvement]
Effort: [Low/Medium/High]
Expected Impact: [Quantified if possible]
Priority: [P1/P2/P3]
\`\`\`

## Best Practices
- Build journey maps from real customer data (interviews, analytics, support tickets)
- Create separate maps for different personas (power user vs. casual user)
- Include both digital and human touchpoints
- Update maps quarterly as the product evolves
- Share maps with the entire team (not just product/design)
- Focus on emotions, not just actions — feelings drive decisions`,
  },
  {
    slug: 'growth-hacking-playbook',
    name: 'Growth Hacking Playbook',
    description:
      'Rapid experimentation framework for user acquisition, activation, retention, and referral optimization.',
    category: 'creative',
    tags: ['growth', 'experimentation', 'acquisition', 'viral', 'AARRR'],
    author: 'Orqaly',
    version: '1.0',
    compatible_roles: ['all'],
    icon: 'lightbulb',
    is_bundled: true,
    content: `# Growth Hacking Playbook

## Purpose
Drive rapid, measurable user growth through systematic experimentation across the AARRR funnel. Growth hacking is about finding scalable, repeatable tactics through disciplined testing.

## The AARRR Framework

### 1. Acquisition — How users find you
Channels to test:
- **Organic:** SEO, content marketing, social media, community
- **Paid:** Google Ads, social ads, sponsorships, influencers
- **Viral:** Referrals, word-of-mouth, built-in sharing
- **Sales:** Outbound email, partnerships, events

Key metric: **CAC (Customer Acquisition Cost)** per channel
Goal: Find 2-3 channels where CAC < 1/3 of LTV

### 2. Activation — How users experience the "aha moment"
Tactics:
- Optimize onboarding to reach first value in < 5 minutes
- Remove signup friction (fewer fields, social login, progressive profiling)
- Personalize the first experience based on user intent
- Use checklists and progress bars to guide completion

Key metric: **Activation rate** (% who complete key action within first session)
Goal: >40% of signups reach activation milestone

### 3. Retention — How users keep coming back
Tactics:
- Email/push nudges for inactive users (day 1, 3, 7, 14, 30)
- Feature discovery prompts for underused but sticky features
- Habit loops: trigger -> action -> reward -> investment
- Community building (forums, Discord, user groups)

Key metric: **D1/D7/D30 retention** and **monthly active rate**
Goal: D30 retention > 20% (B2C) or > 60% (B2B SaaS)

### 4. Revenue — How users pay
Tactics:
- Free trial with gentle upgrade prompts at value moments
- Usage-based pricing with natural expansion
- Annual discount to reduce churn and improve cash flow
- In-product upgrade prompts when hitting plan limits

Key metric: **ARPU** and **conversion rate** (free to paid)
Goal: Free-to-paid conversion > 5% (self-serve) or > 15% (sales-assisted)

### 5. Referral — How users bring others
Tactics:
- Two-sided referral rewards (give $X, get $X)
- Built-in sharing (invite team, share results, public profiles)
- NPS-triggered referral asks (ask promoters, not detractors)
- Partner and affiliate programs

Key metric: **Viral coefficient (K)** = invites x conversion rate
Goal: K > 0.5 (amplifies other channels)

## Experiment Template
\`\`\`
Experiment: [Name]
Funnel Stage: [Acquisition/Activation/Retention/Revenue/Referral]
Hypothesis: If we [change], then [metric] will [improve/increase] by [X%]
            because [reasoning].
Metric: [Primary metric to measure]
Target: [Success threshold]
Audience: [Who sees this experiment, sample size]
Duration: [How long to run]
Implementation: [What to build/change]
Result: [Outcome after experiment]
Decision: [Ship / Iterate / Kill]
\`\`\`

## Prioritization (ICE Score)
For each experiment idea:
- **Impact:** How much will this move the metric? (1-10)
- **Confidence:** How sure are we it will work? (1-10)
- **Ease:** How easy is it to implement? (1-10)
- **ICE Score** = (Impact + Confidence + Ease) / 3

Run experiments in order of ICE score. Aim for 2-3 experiments per week.

## Best Practices
- Run one experiment per funnel stage at a time (avoid confounding)
- Define success criteria BEFORE launching (not after seeing results)
- Kill experiments that do not show signal within 2 weeks
- Document every experiment (wins AND losses) in a shared log
- Focus on the leakiest part of the funnel first
- Compound small wins: 10 experiments x 5% improvement each = 63% total improvement`,
  },
];
