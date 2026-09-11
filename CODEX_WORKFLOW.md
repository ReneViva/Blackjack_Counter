# Codex Development Workflow & Execution Rules

## Purpose

This document defines **how Codex will be used to build the Blackjack Casino Simulation & Probability Analysis application**.

Codex is the implementation agent.

ChatGPT is the **planning and prompt-generation layer**.

The project must be developed in controlled phases so that Codex does not:

- hallucinate files, APIs, requirements, or architecture
- make unrelated changes
- silently redesign the system
- fix one feature while breaking another
- rewrite working code unnecessarily
- skip validation
- invent requirements not present in the project documentation
- continue into future phases without authorization
- claim success without testing

The authoritative project documents are:

```text
README.md
THEORY.md
TECHNICAL.md
CODEX_WORKFLOW.md
```

Codex must use these documents as its implementation source of truth.

---

# 1. Roles

## ChatGPT Role

ChatGPT is responsible for:

- maintaining the implementation plan
- deciding the current development phase
- writing Codex prompts
- defining scope for each prompt
- defining acceptance criteria
- defining required tests
- reviewing Codex reports
- identifying whether another prompt is needed
- deciding when it is safe to move to the next phase
- preventing unrelated scope expansion

The prompts given to Codex should be created by ChatGPT based on:

```text
README.md
THEORY.md
TECHNICAL.md
current repository state
previous completed phases
test results
known bugs
current user instruction
```

ChatGPT should not blindly generate the next prompt from the original roadmap.

Before each new phase, the actual repository state must be considered.

---

## Codex Role

Codex is responsible for:

- inspecting the current repository
- understanding the requested phase
- implementing only the requested work
- preserving existing working behavior
- writing or updating tests
- running required tests
- reporting exactly what changed
- reporting failures honestly
- stopping when the requested scope is complete

Codex is **not** responsible for deciding the project roadmap.

Codex must not independently move to the next development phase.

---

# 2. Core Development Principle

The project will follow:

```text
PLAN
  ↓
PROMPT
  ↓
PREFLIGHT
  ↓
IMPLEMENT
  ↓
TEST
  ↓
REVIEW
  ↓
REPORT
  ↓
NEXT PROMPT
```

No phase should bypass this cycle.

---

# 3. Source of Truth

Codex must treat the following files as authoritative.

## README.md

Defines:

- project purpose
- features
- functional requirements
- user-facing behavior
- educational scope

## THEORY.md

Defines:

- mathematical theory
- exact probability model
- hidden-information theory
- Monte Carlo theory
- confidence intervals
- counting-system research framing

## TECHNICAL.md

Defines:

- technology stack
- architecture
- frontend/backend boundary
- API structure
- folder structure
- file responsibilities
- state management
- testing strategy
- deployment approach

## CODEX_WORKFLOW.md

Defines:

- Codex operating rules
- implementation phases
- change-control process
- testing rules
- prompt workflow

If implementation details conflict, Codex must **stop and report the conflict** rather than silently choosing one interpretation.

---

# 4. No Hallucination Rule

Codex must never assume that a file, function, package, API, endpoint, component, schema, branch, or configuration exists.

Before referring to an existing repository element, Codex must verify it.

Examples of forbidden behavior:

```text
"I updated src/services/api.ts"
```

when the file does not exist.

```text
"The project already uses Zustand"
```

without checking `package.json` and source code.

```text
"I reused the existing GameState service"
```

when no such service exists.

Correct behavior:

```text
I inspected the repository and found that no shared API client exists.
I created frontend/src/api/client.ts because it is required by this phase.
```

---

# 5. Inspect Before Editing

Every Codex task must begin with a repository preflight.

Codex should inspect at minimum:

```text
git status
current branch
relevant directory tree
relevant package/dependency files
relevant source files
relevant tests
project documentation
```

The exact inspection depends on the phase.

Codex must not begin editing immediately from assumptions.

---

# 6. Preserve Existing Work

Existing working behavior is protected.

Codex must assume that code outside the requested scope is intentional unless evidence proves otherwise.

Forbidden:

```text
large unrelated refactors
renaming folders for preference
reformatting the whole repository
changing unrelated APIs
changing UI design during backend work
changing dependencies without need
rewriting working modules because another style is preferred
```

Preferred:

```text
smallest coherent change that fully satisfies the phase
```

---

# 7. Do Not Fix One Thing and Break Another

This is a critical project rule.

After every implementation, Codex must check:

```text
What existing behavior could this change affect?
```

Before completing the task, it must run:

1. tests directly related to the changed code
2. broader regression tests appropriate to the repository
3. frontend build if frontend code changed
4. backend tests if backend code changed
5. type checking/linting when configured

If a previously passing test fails after the change, Codex must investigate.

It must not simply update the test to match the new behavior unless the specification explicitly changed.

---

# 8. Tests Are Protection, Not Obstacles

Codex must never delete or weaken a valid test merely to make a build pass.

Forbidden examples:

```text
remove assertion
skip failing test
increase tolerance without reason
comment out test
mock away the behavior being tested
```

If a test is genuinely obsolete because the specification changed, Codex must:

- explain why
- update it explicitly
- ensure replacement coverage exists

---

# 9. Scope Control

Every Codex prompt will define:

```text
IN SCOPE
OUT OF SCOPE
ACCEPTANCE CRITERIA
TESTS
```

Codex must respect them.

If Codex discovers an unrelated bug:

```text
report it
do not fix it
```

unless the bug blocks the requested phase.

If it blocks the phase, Codex should explain the blocker and make only the minimum required fix.

---

# 10. No Silent Architecture Changes

Codex may not independently change:

```text
React → another frontend framework
FastAPI → Django/Flask
REST → GraphQL
local state → database
no database → database
event reducer → unrelated state architecture
Python probability engine → frontend probability engine
```

Architecture changes require an explicit prompt.

---

# 11. Dependency Rule

Codex must not add packages just because they are convenient.

Before adding a dependency, Codex must answer:

```text
Why is the standard library/current stack insufficient?
What file requires this dependency?
Is it already installed transitively?
Does the project actually need it?
```

New dependencies must be reported.

---

# 12. No Premature Optimization

Codex must implement the simplest correct version first.

Do not introduce:

```text
Redis
Celery
WebSockets
microservices
database
distributed cache
GPU computing
multiprocessing
Numba
complex state libraries
```

unless a later prompt explicitly requests them.

Optimization must follow profiling.

---

# 13. No Real-Time Casino Integration

The project is an educational simulator.

Codex must not add:

```text
casino scraping
live casino feeds
betting APIs
real-money payment systems
automated wagering
casino account integration
browser automation against gambling websites
```

The application operates on user-entered or simulated game state.

---

# 14. Prompt Authority

Codex should only implement work explicitly authorized by the current prompt.

Even if `TECHNICAL.md` describes future features, those features are not automatically authorized.

Example:

If current prompt is Phase 3:

```text
frontend event state
```

Codex must not also implement:

```text
exact probability
Monte Carlo
research models
deployment
```

because those appear later in the documentation.

---

# 15. ChatGPT as Prompt Generator

For this project, **ChatGPT generates the Codex prompts**.

The normal workflow is:

```text
User
  ↓
asks to continue development
  ↓
ChatGPT reviews current phase/repository state
  ↓
ChatGPT creates a bounded Codex prompt
  ↓
User gives prompt to Codex
  ↓
Codex performs the implementation
  ↓
Codex returns report
  ↓
User gives report back to ChatGPT
  ↓
ChatGPT evaluates report
  ↓
next prompt is created
```

Codex should not create its own future phase prompts.

---

# 16. Prompt Format

Every implementation prompt should contain approximately:

```text
ROLE
CONTEXT
CURRENT PHASE
OBJECTIVE
PREFLIGHT
IN SCOPE
OUT OF SCOPE
IMPLEMENTATION REQUIREMENTS
FILES LIKELY INVOLVED
TEST REQUIREMENTS
ACCEPTANCE CRITERIA
FINAL REPORT FORMAT
STOP CONDITIONS
```

Not every prompt must use exactly those headings, but the information should be present.

---

# 17. Preflight Requirements

At the beginning of each prompt, Codex should report:

```text
current branch
current HEAD
git status
relevant repository structure
existing implementation related to task
existing tests
unexpected modifications
```

If there are unrelated dirty files:

```text
do not overwrite them
do not reset them
do not include them in the phase unless explicitly authorized
```

---

# 18. Dirty Working Tree Rule

Codex must never use destructive commands such as:

```text
git reset --hard
git clean -fd
git checkout -- .
```

unless explicitly authorized.

If unrelated changes exist:

```text
preserve them
work around them
report them
```

---

# 19. Existing User Changes Are Protected

Files modified before Codex starts may contain important user work.

Codex must not:

```text
discard
overwrite wholesale
revert
format aggressively
```

those changes.

If modification is required, perform a minimal merge.

---

# 20. File Creation Rule

Codex may create files required by the current phase.

It must not create speculative infrastructure for possible future use.

Bad:

```text
creating database models during Phase 1
creating WebSocket services "for later"
creating empty modules for every future phase
```

Good:

```text
creating only the files required to satisfy the current phase cleanly
```

---

# 21. Refactoring Rule

Refactoring is allowed only if:

1. it is necessary for the requested feature, or
2. the prompt explicitly requests it.

Any refactor must preserve behavior unless the specification explicitly changes behavior.

Large refactors should normally be their own phase/prompt.

---

# 22. Comments and Documentation

Codex should write comments for:

```text
non-obvious probability logic
hidden-card reasoning
canonical cache keys
rule edge cases
statistical formulas
```

Avoid comments that merely restate obvious code.

Example bad comment:

```python
# Add 1 to count
count += 1
```

Example useful comment:

```python
# The hidden card is marginalized rather than removed from every rank
# because its identity is unknown.
```

---

# 23. Error Handling Rule

Do not silently swallow errors.

Forbidden:

```python
try:
    ...
except Exception:
    pass
```

Prefer:

```text
structured domain error
structured API error
test covering failure condition
```

Unexpected errors should remain visible during development.

---

# 24. No Fake Success

Codex may only report:

```text
SUCCESS
```

when required validation has actually passed.

If:

```text
frontend build was not run
```

Codex must not claim that the frontend build passed.

If:

```text
tests could not run
```

state exactly why.

---

# 25. Final Codex Report

Every Codex implementation should end with a structured report containing:

```text
STATUS

PREFLIGHT

CHANGES

FILES CHANGED

TESTS RUN

TEST RESULTS

REGRESSION CHECK

DEPENDENCIES

KNOWN LIMITATIONS

UNEXPECTED FINDINGS

GIT STATUS

NEXT PHASE READINESS
```

The report must distinguish:

```text
verified fact
assumption
not tested
```

---

# 26. Git Commit Policy

Unless the current prompt explicitly asks Codex to commit:

```text
do not commit automatically
```

If commits are requested:

- one coherent commit per phase or logical unit
- clear commit message
- no unrelated files
- verify diff before commit

Example:

```text
feat: add immutable blackjack domain models
```

---

# 27. Phase Gates

A phase is complete only when:

1. implementation exists
2. requested tests pass
3. regression checks pass
4. documentation changes required by the phase are complete
5. Codex reports no unresolved blocker
6. ChatGPT reviews the result

Only then should the next phase prompt be generated.

---

# 28. Phase Strategy

The project will be built in controlled phases.

Some adjacent sub-phases may be combined into one Codex prompt when:

- they form one coherent unit
- the changes are easy to test together
- rollback is clear
- the combined scope remains understandable

They should remain separate when:

- they touch unrelated systems
- a failure would be difficult to diagnose
- the implementation risk becomes too large
- acceptance criteria become ambiguous

---

# 29. Development Phase 0 — Repository Audit

## Objective

Understand the starting repository before implementation.

## Codex Should

Inspect:

```text
repository tree
git status
branch
HEAD
README.md
THEORY.md
TECHNICAL.md
CODEX_WORKFLOW.md
existing frontend/backend code
existing dependencies
existing tests
```

## Deliverable

A repository audit only.

No implementation unless explicitly requested.

## Verify

```text
what already exists
what is missing
whether documentation matches repository
whether there are dirty files
```

---

# 30. Development Phase 1 — Project Foundation

## Objective

Create the minimal runnable frontend/backend foundation.

## Frontend

Create/configure:

```text
React
TypeScript
Vite
```

## Backend

Create/configure:

```text
Python
FastAPI
Pydantic
pytest
```

## Required Functionality

Frontend loads.

Backend exposes:

```text
GET /api/health
```

Frontend can successfully call the backend health endpoint.

## Codex Must Not Add

```text
game engine
probability engine
database
research logic
Monte Carlo
```

## Acceptance

```text
frontend tests/build pass
backend tests pass
health request works
```

---

# 31. Development Phase 2 — Core Domain Models

## Objective

Create the mathematical/domain foundation.

Implement:

```text
Rank
Suit
Card
ObservedCard
Rules
Hand
Shoe
Outcome
GameState
```

Use immutable Python structures where appropriate.

## Focus

Correct representations only.

No probability recursion yet.

## Tests

Verify:

```text
52 cards per deck
correct exact-card multiplicity
1–8 decks
card equality/hashability
rule validation
```

---

# 32. Development Phase 3 — Frontend Session & Event Model

## Objective

Implement browser-side table/session state.

Create:

```text
event definitions
gameReducer
initial state
selectors
session persistence interface
```

Support events:

```text
NEW_SHOE
DEAL_KNOWN_CARD
DEAL_UNKNOWN_CARD
UNDO
RESET
ROUND_COMPLETE
SHUFFLE
```

## Acceptance

A deterministic event list can reconstruct the visible table state.

No backend probability calculation yet.

---

# 33. Development Phase 4 — Setup & Table UI

## Objective

Create the usable interactive table.

Implement:

```text
Setup page
deck count selector
seat selector
rule form
table
dealer seat
player seats
card picker
unknown card
shoe status
event history
undo
```

## Acceptance

The user can represent a complete observed simulated table state.

## Codex Must Not

implement fake frontend probability formulas.

---

# 34. Development Phase 5 — Backend State Reconstruction

## Objective

Convert frontend state into canonical Python state.

Implement:

```text
Pydantic request schemas
state builder
shoe builder
known-card removal
unknown-card representation
```

## Endpoint

```text
POST /api/validate
```

## Acceptance

Valid table states reconstruct correctly.

---

# 35. Development Phase 6 — Validation Engine

## Objective

Reject impossible states.

Validate:

```text
exact-card multiplicity
rank multiplicity
deck count
unknown cards
seat validity
rule compatibility
game phase
```

## Acceptance

Known invalid states are rejected with structured error codes.

Existing valid states remain accepted.

---

# 36. Development Phase 7 — Hand Evaluation

## Objective

Implement deterministic blackjack hand mathematics.

Support:

```text
hard totals
soft totals
multiple aces
natural blackjack
ordinary 21
bust
pair
split metadata
```

## Required Tests

Examples:

```text
A + 6 = soft 17
A + 6 + 9 = hard 16
A + A + 9 = 21
10 + K = 20
A + K = blackjack
```

---

# 37. Development Phase 8 — Rules Engine

## Objective

Implement configurable blackjack rule behavior.

Start with the actual documented MVP rule set.

Examples:

```text
dealer hit/stand soft 17
splitting eligibility
split-ace restrictions
doubling eligibility
surrender configuration
```

## Rule

Do not implement undocumented casino behavior.

If a rule is ambiguous, Codex must stop and report the ambiguity.

---

# 38. Development Phase 9 — Dealer Engine

## Objective

Implement dealer progression independent of probability recursion.

Functions should determine:

```text
dealer hand status
required dealer action
terminal dealer state
```

## Acceptance

S17 and H17 tests pass.

---

# 39. Development Phase 10 — Transition Engine

## Objective

Create pure state transitions.

Given:

```text
state + possible next card
```

return:

```text
new immutable state
```

The transition must:

```text
remove exactly one card
update hand
preserve rules
preserve hidden state
preserve canonical form
```

This phase prepares exact recursion.

---

# 40. Development Phase 11 — Exact Probability Foundation

## Objective

Implement small-state exact probability calculation.

Start with controlled/simple states.

Implement:

```text
possible next draws
branch probabilities
terminal outcomes
weighted outcome distributions
```

## Required Invariant

```text
win + push + loss ≈ 1
```

Do not optimize heavily yet.

---

# 41. Development Phase 12 — Memoization & Canonical States

## Objective

Make exact recursion efficient and correct.

Implement:

```text
canonical state keys
per-analysis cache
cache metrics
```

Test that mathematically equivalent states reuse cached results.

## Important

Do not include irrelevant UI data in cache keys.

---

# 42. Development Phase 13 — Exact Analysis API

## Objective

Expose exact computation to the frontend.

Endpoint:

```text
POST /api/analyze
```

Return:

```text
outcomes
state summary
runtime
states evaluated
cache information
```

Frontend displays exact results.

---

# 43. Development Phase 14 — Hidden Card Marginalization

## Objective

Implement exact hidden-card treatment.

Unknown cards are latent variables.

Codex must not fake them by:

```text
decrementing total cards while leaving every rank unchanged
```

Implement:

```text
hidden-card distribution
exact hidden-state branches
weighted marginal result
```

Use manually provable small tests.

---

# 44. Development Phase 15 — Unknown Deck / Rule Scenarios

## Objective

Implement model uncertainty outside the core exact state.

Unknown deck count:

```text
analyze separate scenarios for 1–8 decks
```

Unknown supported rule:

```text
analyze one scenario per rule value
```

Return scenario results.

Do not silently average without an explicit prior.

---

# 45. Development Phase 16 — Monte Carlo Engine

## Objective

Implement repeated simulation.

Requirements:

```text
sampling without replacement
seeded RNG
hidden-state sampling
terminal outcome recording
simulation limits
```

Return raw counts and estimates.

## Tests

Same seed must reproduce the same simulation result.

---

# 46. Development Phase 17 — Confidence Intervals

## Objective

Implement Wilson confidence intervals.

Support:

```text
90%
95%
99%
```

## Important

Exact results must not receive Monte Carlo confidence intervals.

---

# 47. Development Phase 18 — Compare Exact vs Monte Carlo

## Objective

Allow:

```text
Exact
Monte Carlo
Compare Both
```

Frontend should clearly distinguish:

```text
exact probability
simulation estimate
confidence interval
```

Test convergence on controlled states.

---

# 48. Development Phase 19 — Research Count Definitions

## Objective

Add instructor-approved counting/scoring definitions.

Research models include:

```text
Wong Halves
Zen
Omega II
Ace Side
```

They are treated as research features.

## Important

Definitions must come from approved/cited project sources.

Codex must not invent weights from memory.

If source definitions are missing, Codex must stop and report:

```text
source data required
```

---

# 49. Development Phase 20 — Generic Count Engine

## Objective

Implement one data-driven score engine.

Input:

```text
observed card history
count definition
```

Output:

```text
research score
```

Do not duplicate the same algorithm across separate files unless mathematically necessary.

---

# 50. Development Phase 21 — Research Comparison API

## Objective

Return:

```text
exact reference
count model scores
ace-side features
```

Endpoint:

```text
POST /api/research/compare
```

No wagering or bet sizing.

---

# 51. Development Phase 22 — Batch Experiment Generator

## Objective

Generate physically valid simulated states.

Method:

```text
build actual virtual shoe
sample/removes cards
capture states
```

Do not independently generate impossible rank-count vectors.

Support reproducible seed.

---

# 52. Development Phase 23 — Research Metrics

## Objective

Implement:

```text
Pearson correlation
Spearman correlation
MAE
RMSE
Brier score where applicable
```

Metrics must be backend calculations.

Tests should compare against known examples.

---

# 53. Development Phase 24 — Research UI

## Objective

Create:

```text
comparison table
experiment settings
charts
metric displays
export buttons
```

Charts should visualize backend data.

React must not independently calculate the statistical metrics.

---

# 54. Development Phase 25 — Replay & Export

## Objective

Support:

```text
replay JSON
analysis JSON
research CSV
```

Replay source of truth:

```text
schema version
rules
events
```

Do not rely on saved derived probabilities.

---

# 55. Development Phase 26 — Persistence

## Objective

Add optional localStorage persistence.

Persist:

```text
rules
events
UI settings
analysis settings
```

Do not add a database.

Include schema versioning.

---

# 56. Development Phase 27 — Performance Profiling

## Objective

Measure before optimizing.

Measure:

```text
exact runtime
unique state count
cache hit rate
Monte Carlo runs/second
frontend render behavior
```

Codex should produce actual measurements.

No speculative optimization.

---

# 57. Development Phase 28 — Targeted Optimization

## Objective

Optimize only measured bottlenecks.

Possible tools if justified:

```text
better canonical state
rank compression
reduced object allocation
NumPy
multiprocessing
```

Each optimization must include regression tests proving results remain mathematically equivalent.

---

# 58. Development Phase 29 — Accessibility & UX Hardening

## Objective

Improve:

```text
keyboard access
focus states
labels
responsive layout
error clarity
loading states
stale-result handling
```

No mathematical behavior changes unless fixing a verified bug.

---

# 59. Development Phase 30 — Full Regression & Final Validation

## Objective

Run the complete validation suite.

Required:

```text
backend tests
frontend tests
frontend build
lint/typecheck if configured
API integration tests
manual smoke test
documentation review
git diff review
```

Verify all documented core features.

---

# 60. Development Phase 31 — Deployment

## Objective

Deploy the classroom-ready version.

Preferred simple architecture:

```text
React build
served with or alongside
FastAPI
```

Only deploy after tests are green.

---

# 61. Development Phase 32 — Presentation & Demonstration Support

## Objective

Prepare reproducible course demonstrations.

Create:

```text
sample scenarios
research datasets
known exact examples
Monte Carlo convergence example
hidden-card example
rule-sensitivity example
```

No core behavior should be changed merely for presentation convenience.

---

# 62. Combining Phases

ChatGPT may combine adjacent phases into one Codex prompt when safe.

Examples that may combine well:

```text
Domain Models + basic tests
Hand Evaluator + dealer rules
Monte Carlo + confidence intervals
Research definitions + generic count engine
```

Examples that should usually remain separate:

```text
exact recursion + UI redesign
research module + deployment
large refactor + new probability feature
```

The deciding factor is:

```text
Can this combined task be implemented and validated as one coherent unit?
```

---

# 63. Codex Stop Conditions

Codex must stop and report instead of guessing when:

```text
required source file is missing
documentation conflicts
count-system definitions are not provided
repository state differs materially from prompt assumptions
unexpected failing tests indicate unrelated breakage
a requested change would require architecture redesign
a protected dirty file would need destructive overwrite
acceptance criteria cannot be verified
```

Stopping with a clear blocker is preferable to hallucinating a solution.

---

# 64. Bug-Fix Workflow

When a bug is found:

```text
reproduce
   ↓
identify root cause
   ↓
add/update regression test
   ↓
make smallest fix
   ↓
run focused tests
   ↓
run broader regression
```

Codex should not patch symptoms without understanding the cause.

---

# 65. Regression Rule

Every bug fix should answer:

```text
What test prevents this exact bug from returning later?
```

If no test can reasonably be written, Codex should explain why.

---

# 66. API Change Rule

If an API request or response changes:

Codex must inspect:

```text
backend schema
backend route
frontend API types
frontend API client
components using response
integration tests
documentation if required
```

Do not update only one side.

---

# 67. Domain Change Rule

If a domain model changes:

Codex must inspect all affected:

```text
schemas
state builder
engine
probability cache key
tests
frontend network contract
replay format
```

This is especially important because adding a field to `GameState` can silently invalidate caching or serialization.

---

# 68. Probability Change Rule

Any modification to probability code requires:

```text
manual small-state test
probability-sum invariant
existing exact tests
hidden-card tests if relevant
Monte Carlo comparison if relevant
```

Mathematical code should never be changed without regression coverage.

---

# 69. Cache Change Rule

Any cache-key modification requires testing:

```text
equivalent states share key
different rules do not share key
different shoe compositions do not share key
different hidden constraints do not share key
```

Incorrect caching can return plausible but mathematically wrong probabilities.

---

# 70. Frontend Change Rule

Frontend changes must preserve:

```text
event source of truth
analysis stale-state behavior
API contract
unknown-card distinction
known-card multiplicity display
```

The frontend must never fabricate probability values while waiting for the backend.

---

# 71. Research Model Rule

Research counting systems are not the source of truth.

Codex must preserve this hierarchy:

```text
exact composition model
        ↓
reference probability

count model
        ↓
research score
```

Do not turn a count score directly into probability unless a separate calibrated research model is explicitly requested.

---

# 72. Statistical Integrity Rule

Codex must not:

```text
attach confidence intervals to exact deterministic results
call model sensitivity a confidence interval
average unknown deck scenarios without an explicit prior
treat a count score as a probability
claim convergence from one simulation run
```

If unclear, refer to `THEORY.md`.

---

# 73. No Hidden Defaults

Important model assumptions should be explicit.

Examples:

```text
deck count
soft-17 rule
simulation count
confidence level
seed
split rules
```

Codex should not insert silent mathematical defaults unless documented.

If a UI convenience default exists, it must still be visible to the user.

---

# 74. Naming Rule

Prefer terminology already established in project docs.

Examples:

```text
Exact
Monte Carlo
Unknown Card
Model Uncertainty
Confidence Interval
Outcome Distribution
Rule Profile
Shoe
```

Do not rename concepts casually.

---

# 75. Completion Report Example

Codex final output should resemble:

```text
STATUS: SUCCESS

PREFLIGHT
- Branch: main
- HEAD: ...
- Working tree before changes: ...
- Relevant existing implementation: ...

IMPLEMENTED
- Added immutable Card, Rank, Suit models
- Added fresh shoe builder for 1–8 decks
- Added multiplicity validation

FILES CHANGED
- backend/app/domain/card.py
- backend/app/domain/shoe.py
- tests/backend/unit/test_shoe.py

TESTS
- pytest tests/backend/unit/test_shoe.py
- pytest tests/backend/unit
- Result: all passed

REGRESSION
- No unrelated test failures
- Frontend untouched

DEPENDENCIES
- None added

KNOWN LIMITATIONS
- Probability engine intentionally not implemented in this phase

GIT STATUS
- ...

NEXT PHASE READINESS
- Phase complete
```

This level of reporting is expected.

---

# 76. What Codex Must Never Do

Codex must never:

- hallucinate success
- invent missing mathematical definitions
- silently change requirements
- delete tests to pass
- reset unrelated work
- add a database without authorization
- implement future phases automatically
- replace the selected stack
- mix UI logic into probability code
- put backend mathematics into React
- store percentages as strings in the math engine
- treat unknown cards as known cards
- silently assume unknown deck count
- silently average incompatible models
- hide test failures
- modify unrelated files for style
- make broad formatting-only diffs during feature work
- introduce secrets into source control

---

# 77. What Codex Should Optimize For

Codex should optimize for:

```text
correctness
testability
small coherent changes
clear ownership between modules
mathematical integrity
reproducibility
maintainability
regression safety
```

Not:

```text
maximum number of files
maximum abstraction
cleverness
premature optimization
rewriting code for personal style preference
```

---

# 78. ChatGPT Review Checklist After Every Codex Run

When the Codex report is returned, ChatGPT should review:

```text
Did Codex stay within scope?
Did it inspect before editing?
Did it preserve unrelated changes?
Were tests actually run?
Are test results explicit?
Did any dependencies change?
Did architecture drift?
Did it modify mathematical behavior?
Are there untested paths?
Did it report dirty files?
Are acceptance criteria satisfied?
Is the next phase actually safe?
```

If not, ChatGPT should generate a correction prompt before advancing.

---

# 79. Prompt Evolution

Future Codex prompts should depend on actual repository progress.

Do not blindly reuse old prompts.

If implementation changes:

```text
folder names
API shape
domain model
testing approach
```

the next prompt must reflect the real codebase.

This is why ChatGPT remains the prompt-generation layer throughout development.

---

# 80. Final Workflow

The complete working relationship is:

```text
PROJECT DOCUMENTATION
README / THEORY / TECHNICAL / CODEX_WORKFLOW
                 │
                 ▼
              ChatGPT
       plans next safe unit
                 │
                 ▼
          CODEX PHASE PROMPT
                 │
                 ▼
              Codex
      inspect → edit → test
                 │
                 ▼
          CODEX REPORT
                 │
                 ▼
              ChatGPT
     verifies scope and result
                 │
                 ▼
      correction or next phase
```

This process should continue until the complete application is finished.

---

# 81. Final Rule

The most important rule for Codex is:

> **Do not guess. Inspect first. Change only what is required. Prove the change with tests. Preserve everything outside the requested scope.**

The most important rule for ChatGPT is:

> **Generate each Codex prompt from the documented architecture and the repository's actual current state, not from assumptions about what Codex probably implemented.**

This workflow is intended to prevent the most common agentic-development failure:

> fixing one thing while silently breaking another.

---

# 82. Authoritative Phase 6-10 Completion Contract

Phases 6-10 are complete only when the implementation satisfies the detailed
gameplay-state contract in `TECHNICAL.md` section 156. That contract is
authoritative for this phase sequence and resolves the previously unspecified
game-phase and transition behavior.

## Runtime State Gate

Keep the immutable structural `GameState`. Add an immutable runtime `RoundState`
containing ordered player-hand metadata, one of `DEALER_CHECK`, `PLAYER_TURNS`,
`DEALER_TURN`, or `ROUND_COMPLETE`, an optional active hand index, and one of
`NOT_REQUIRED`, `PENDING`, `NO_BLACKJACK`, or `BLACKJACK` for dealer check state.

Runtime player hands carry seat, immutable hand, status, split depth,
split-Ace origin, decision count, and doubled state. Player status is one of
`ACTIVE`, `STOOD`, `BUST`, `BLACKJACK`, or `SURRENDERED`.

## Rules Gate

Preserve deck count and H17/S17 behavior. Support and strictly validate the
documented defaults for splitting, maximum split hands, resplit Aces, hitting
split Aces, blackjack after split, doubling, double after split, late surrender,
dealer second-card style, and dealer blackjack checking. Reject
`NO_HOLE_CARD + PEEK`. Existing payloads that omit new fields must remain valid
through defaults.

## Shoe and Reveal Gate

Track latent physical removals with immutable `Shoe.unknown_removed_count`.
Known removals decrement exact composition; unknown removals increment only the
latent count. Physical cards remaining equal exact-count sum minus latent
removals. Revealing an unknown decrements both the supplied exact count and the
latent count, preserving physical total. Never infer or distribute hidden-card
identities.

## Hand and Action Gate

Retain dynamic-Ace, hard/soft, bust, exact-rank pair, ordinary-21, blackjack,
and unknown/indeterminate evaluation. Apply the configured
`blackjack_after_split` rule through explicit split context.

During `PLAYER_TURNS`, implement deterministic `HIT`, `STAND`, `SPLIT`,
`DOUBLE`, and `SURRENDER` transitions exactly as specified in `TECHNICAL.md`.
All dealt cards are explicit observations; no transition draws randomly.
Splits use exact rank equality, require two explicit child draws, preserve
same-seat ordering and limits, and enforce the split-Ace rules. Double consumes
one card and terminates without monetary semantics. Only late surrender is
supported.

Advance to the next active hand after terminal player actions. When none
remains, complete immediately if all hands busted or surrendered; otherwise
enter dealer play.

## Dealer and Outcome Gate

Gate eligible hole-card peek scenarios in `DEALER_CHECK`; resolution records
`NO_BLACKJACK` or `BLACKJACK` without revealing a hidden identity. During
`DEALER_TURN`, preserve H17/S17 dealer policy, require an explicit card only for
`HIT_REQUIRED`, complete on stand/blackjack/bust, and block indeterminate play
until reveal.

At `ROUND_COMPLETE`, derive `WIN`, `PUSH`, or `LOSS` for determinate hands using
the documented surrender, bust, blackjack, dealer-bust, and total-comparison
precedence. Leave indeterminate outcomes as `None`; do not calculate payouts or
expected value.

## Validation and Test Gate

Phase 6 must validate phase/index/status consistency, pending-check gating,
runtime seat and per-seat hand limits, structural state/rule compatibility,
exact and physical shoe counts, latent-count bounds, and dealer-check
configuration. Transition failures use stable structured codes rather than
arbitrary exception messages.

Completion requires focused tests for:

- strict rule defaults and invalid combinations;
- known, unknown, and reveal shoe bookkeeping;
- all four phases and dealer-check resolution;
- hit, stand, split, double, and late surrender legality and transitions;
- split ordering, same-seat limits, split-Ace behavior, and split blackjack;
- deterministic dealer advancement and unknown reveal;
- outcome resolution, indeterminate values, immutability, and repeatability;
- accessible frontend controls and transport serialization for every new rule.

Run the full backend and frontend regression suites, typecheck, build, package
integrity, compile/import/API smoke checks, and localhost integration checks.
Phase 11 probability work is a separate gate and must not begin as part of this
contract. In particular, `unknown_removed_count` is bookkeeping only and must
not drive probability, marginalization, recursion, simulation, EV, or counting
logic.
