# Blackjack Casino Simulation — Technical Architecture & Implementation Specification

## Purpose

This document defines the **technical and programming architecture** for the Blackjack Casino Simulation & Probability Analysis project.

It is the implementation companion to:

- `README.md` — product scope, features, and project overview
- `THEORY.md` — mathematical and statistical theory
- `TECHNICAL.md` — software architecture, APIs, data flow, folder structure, file responsibilities, state handling, computation, testing, deployment, and implementation details

The application is an **educational simulation and research system**. It models configurable blackjack rules, tracks known and unknown cards, calculates probabilities through Python, and exposes the results through a web interface.

---

# 1. High-Level Architecture

The application will use a classic frontend/backend architecture.

```text
┌─────────────────────────────────────────────┐
│                 Web Browser                 │
│                                             │
│          React + TypeScript + Vite          │
│                                             │
│  Table UI / Rules / Card Input / Results    │
└──────────────────────┬──────────────────────┘
                       │
                       │ HTTP + JSON
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              Python API Server              │
│                                             │
│              FastAPI + Pydantic             │
├─────────────────────────────────────────────┤
│ Request validation                          │
│ Game-state reconstruction                   │
│ Shoe / deck engine                          │
│ Rule engine                                 │
│ Hand evaluator                              │
│ Hidden-card model                           │
│ Exact probability engine                    │
│ Monte Carlo engine                          │
│ Confidence intervals                        │
│ Research/count comparison                   │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
              In-memory computation
```

There is **no required database**.

The frontend owns the current interactive session state.

The backend receives a state snapshot, validates it, performs the requested analysis, and returns a result.

---

# 2. Technology Stack

## Frontend

Use:

- React
- TypeScript
- Vite
- standard CSS or CSS Modules
- Fetch API for HTTP requests

Optional:

- React Router if separate URLs are desired
- Zustand only if React state becomes difficult to manage
- Recharts or Chart.js for research charts

For the initial version, React built-in state management is enough.

---

## Backend

Use:

- Python
- FastAPI
- Pydantic
- Uvicorn

Python owns all probability and blackjack logic.

FastAPI is used because the project needs:

- a small HTTP API
- JSON validation
- generated OpenAPI documentation
- easy React integration
- straightforward Python testing

---

## Numerical / Statistical Packages

Start with the Python standard library.

Possible packages:

```text
numpy
scipy
pandas
```

Use them only where they simplify research or numerical work.

Recommended roles:

### NumPy

Useful for:

- batch simulation
- arrays
- vectorized research calculations
- random number generation if needed

### SciPy

Useful for:

- statistical functions
- confidence intervals
- correlations
- distributions

### pandas

Useful primarily in research mode for:

- experiment datasets
- CSV export
- model comparison tables
- aggregate statistics

The core blackjack engine should **not depend on pandas**.

---

## Testing

Frontend:

```text
Vitest
React Testing Library
```

Backend:

```text
pytest
```

Optional:

```text
pytest-cov
hypothesis
```

Hypothesis can be useful for property-based tests such as:

```text
probabilities always sum to 1
card counts never become negative
```

---

# 3. External APIs

## Required External APIs

None.

The project does **not require any third-party API**.

The application should not depend on:

- casino APIs
- gambling APIs
- payment APIs
- card-data APIs
- authentication APIs
- cloud databases
- real-time casino feeds

All blackjack rules and card models are implemented locally.

---

# 4. Internal API

The React frontend communicates with the Python backend through our own REST API.

Base URL during development:

```text
http://127.0.0.1:8000/api
```

Example frontend development URL:

```text
http://localhost:5173
```

---

# 5. API Endpoints

Recommended MVP endpoints:

```text
GET  /api/health
POST /api/validate
POST /api/analyze
POST /api/simulate
POST /api/research/compare
```

Optional later endpoints:

```text
POST /api/research/batch
POST /api/research/export
POST /api/state/normalize
```

---

# 6. GET /api/health

Purpose:

- verify that the Python backend is running
- allow the frontend to display backend connection status

Response:

```json
{
  "status": "ok",
  "service": "blackjack-analysis-api"
}
```

No blackjack calculation is performed.

---

# 7. POST /api/validate

Purpose:

Validate that a frontend game state is physically and logically possible.

Request:

```json
{
  "rules": {
    "decks": 6,
    "dealer_soft_17": "stand"
  },
  "dealer": {
    "cards": ["KH", "?"]
  },
  "players": [
    {
      "seat": 1,
      "cards": ["8C", "3D"]
    },
    {
      "seat": 2,
      "is_user": true,
      "cards": ["AS", "7D"]
    }
  ],
  "discarded_cards": []
}
```

Response:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

Invalid example:

```json
{
  "valid": false,
  "errors": [
    {
      "code": "TOO_MANY_CARD_COPIES",
      "message": "K♥ appears 7 times but a six-deck shoe contains only 6 copies."
    }
  ]
}
```

---

# 8. POST /api/analyze

Purpose:

Run the **exact probability engine** when computationally feasible.

Request includes:

- rules
- current table state
- known cards
- unknown cards
- requested analysis type

Example:

```json
{
  "state": {
    "rules": {
      "decks": 6,
      "dealer_soft_17": "stand"
    },
    "dealer": {
      "cards": ["KH", "?"]
    },
    "players": [
      {
        "seat": 1,
        "cards": ["8C", "3D"]
      },
      {
        "seat": 2,
        "is_user": true,
        "cards": ["AS", "7D"]
      }
    ],
    "discarded_cards": []
  },
  "options": {
    "method": "exact"
  }
}
```

Example response:

```json
{
  "method": "exact",
  "state_summary": {
    "cards_remaining": 304,
    "known_cards": 7,
    "hidden_cards": 1
  },
  "outcomes": {
    "win": 0.4382,
    "push": 0.0814,
    "loss": 0.4804
  },
  "confidence_interval": null,
  "metadata": {
    "states_evaluated": 18234,
    "cache_hits": 42102,
    "runtime_ms": 183
  }
}
```

Numbers above are examples only.

---

# 9. POST /api/simulate

Purpose:

Run Monte Carlo analysis.

Example request:

```json
{
  "state": {
    "...": "current game state"
  },
  "options": {
    "method": "monte_carlo",
    "simulations": 100000,
    "confidence_level": 0.95,
    "seed": 12345
  }
}
```

Example response:

```json
{
  "method": "monte_carlo",
  "simulations": 100000,
  "seed": 12345,
  "confidence_level": 0.95,
  "outcomes": {
    "win": {
      "estimate": 0.4382,
      "ci_low": 0.4351,
      "ci_high": 0.4413
    },
    "push": {
      "estimate": 0.0814,
      "ci_low": 0.0797,
      "ci_high": 0.0831
    },
    "loss": {
      "estimate": 0.4804,
      "ci_low": 0.4773,
      "ci_high": 0.4835
    }
  },
  "runtime_ms": 900
}
```

Again, values are illustrative.

---

# 10. POST /api/research/compare

Purpose:

Compare instructor-approved counting/scoring definitions with the exact composition model.

This endpoint should not contain wagering recommendations.

Example response shape:

```json
{
  "exact_reference": {
    "win_probability": 0.4382
  },
  "models": [
    {
      "id": "wong_halves",
      "score": 2.5
    },
    {
      "id": "zen",
      "score": 3.0
    },
    {
      "id": "omega_ii",
      "score": 4.0
    }
  ],
  "ace_side": {
    "known_aces_seen": 5,
    "known_aces_remaining": 19
  }
}
```

The exact scoring definitions should be stored as configurable research data and supported by instructor-approved sources.

---

# 11. OpenAPI Documentation

FastAPI automatically generates API documentation.

During development:

```text
http://127.0.0.1:8000/docs
```

provides Swagger UI.

Also:

```text
http://127.0.0.1:8000/redoc
```

provides ReDoc.

These pages make it easy to test backend endpoints without the React frontend.

---

# 12. Application State Ownership

A key architectural decision is:

> The frontend owns the session; the backend owns computation.

The browser stores:

- selected rules
- seats
- cards entered
- event history
- simulation settings
- UI preferences

The backend does **not need to persist user sessions**.

Every analysis request sends enough information for the backend to reconstruct the mathematical state.

Advantages:

- no database
- no login
- no server session synchronization
- easy debugging
- easy testing
- easy replay
- privacy friendly

---

# 13. Where Probabilities Are Stored

Probabilities are **not permanently stored in a database**.

They exist at three levels.

## 13.1 Backend Computation Memory

During a request, probabilities are calculated in Python.

Examples:

```python
win_probability: float
push_probability: float
loss_probability: float
```

Exact recursive sub-results may temporarily live in a memoization cache.

Example:

```python
cache[state_key] = OutcomeDistribution(...)
```

This cache is computational state, not permanent project data.

---

## 13.2 API Response

Final probabilities are returned to the frontend as JSON.

Example:

```json
{
  "win": 0.4382,
  "push": 0.0814,
  "loss": 0.4804
}
```

Use decimal probabilities internally.

Display percentages only in the UI:

```text
0.4382 → 43.82%
```

Do not store `"43.82%"` as the mathematical value.

---

## 13.3 Frontend State

The latest result can be stored in React state:

```ts
type AnalysisResult = {
  win: number;
  push: number;
  loss: number;
};
```

It remains available until:

- another analysis replaces it
- the user resets the session
- the page is refreshed

Optional `localStorage` can persist the latest session.

---

# 14. What Should Go Into localStorage

Optional keys:

```text
blackjack.rules
blackjack.events
blackjack.ui
blackjack.analysisSettings
```

Do **not** make localStorage the mathematical source of truth.

The event list and rules should reconstruct the state.

Example:

```json
{
  "version": 1,
  "rules": {...},
  "events": [...]
}
```

Versioning is important so future changes do not break previously saved sessions.

---

# 15. Event-Sourced Frontend State

The recommended state design is event based.

Instead of directly mutating several arrays, record events such as:

```text
NEW_SHOE
CARD_DEALT
UNKNOWN_CARD_DEALT
CARD_REMOVED
ROUND_FINISHED
SHUFFLE
RESET
```

Example event:

```json
{
  "id": "evt_0007",
  "type": "CARD_DEALT",
  "target": {
    "kind": "player",
    "seat": 2
  },
  "card": "AS",
  "sequence": 7
}
```

Unknown card:

```json
{
  "id": "evt_0008",
  "type": "UNKNOWN_CARD_DEALT",
  "target": {
    "kind": "dealer"
  },
  "sequence": 8
}
```

---

# 16. Why Event Sourcing Is Useful Here

The event sequence enables:

- undo
- replay
- state reconstruction
- research reproducibility
- debugging
- easier validation
- easier export

The current state is derived:

```text
initial state
     +
ordered events
     ↓
current state
```

---

# 17. Frontend State Reducer

Use a reducer:

```ts
const [state, dispatch] = useReducer(gameReducer, initialState);
```

Example actions:

```ts
dispatch({
  type: "DEAL_KNOWN_CARD",
  target: { kind: "player", seat: 2 },
  card: "AS"
});
```

The reducer should be deterministic.

The reducer should **not calculate exact blackjack probabilities**.

Its responsibility is UI/game-state management only.

---

# 18. Frontend / Backend Responsibility Boundary

## Frontend Responsibilities

Frontend handles:

- rendering
- buttons
- card picker
- seat management
- rule form
- event history
- undo
- API calls
- loading states
- error display
- charts
- formatting probabilities

Frontend does not own:

- exact recursive math
- hidden-card marginalization
- Monte Carlo engine
- confidence intervals
- authoritative physical-state validation

---

## Backend Responsibilities

Backend handles:

- request validation
- shoe reconstruction
- known-card removal
- hidden cards
- hand values
- rule enforcement
- exact recursion
- memoization
- Monte Carlo
- confidence intervals
- research score computation
- statistical comparison
- canonical validation

---

# 19. Recommended Project Folder Structure

```text
blackjack-analysis/
│
├── README.md
├── THEORY.md
├── TECHNICAL.md
├── .gitignore
├── .editorconfig
├── docker-compose.yml              # optional
│
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── .env.example
│   │
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── app.css
│       │
│       ├── api/
│       │   ├── client.ts
│       │   ├── analysisApi.ts
│       │   ├── researchApi.ts
│       │   └── types.ts
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Navigation.tsx
│       │   │   └── PageHeader.tsx
│       │   │
│       │   ├── table/
│       │   │   ├── BlackjackTable.tsx
│       │   │   ├── DealerSeat.tsx
│       │   │   ├── PlayerSeat.tsx
│       │   │   ├── CardView.tsx
│       │   │   ├── ShoeStatus.tsx
│       │   │   └── EventHistory.tsx
│       │   │
│       │   ├── cards/
│       │   │   ├── CardPicker.tsx
│       │   │   ├── RankGrid.tsx
│       │   │   ├── SuitRow.tsx
│       │   │   └── UnknownCardButton.tsx
│       │   │
│       │   ├── rules/
│       │   │   ├── RuleSetupForm.tsx
│       │   │   ├── DeckCountSelector.tsx
│       │   │   └── SeatSelector.tsx
│       │   │
│       │   ├── analysis/
│       │   │   ├── AnalysisPanel.tsx
│       │   │   ├── OutcomeProbability.tsx
│       │   │   ├── ConfidenceInterval.tsx
│       │   │   ├── MethodSelector.tsx
│       │   │   └── ComputationMetadata.tsx
│       │   │
│       │   └── research/
│       │       ├── ResearchPanel.tsx
│       │       ├── CountComparisonTable.tsx
│       │       ├── CorrelationChart.tsx
│       │       └── ExperimentSettings.tsx
│       │
│       ├── pages/
│       │   ├── SetupPage.tsx
│       │   ├── TablePage.tsx
│       │   ├── AnalysisPage.tsx
│       │   ├── ResearchPage.tsx
│       │   └── MethodologyPage.tsx
│       │
│       ├── state/
│       │   ├── gameReducer.ts
│       │   ├── initialState.ts
│       │   ├── selectors.ts
│       │   ├── persistence.ts
│       │   └── context.tsx
│       │
│       ├── domain/
│       │   ├── card.ts
│       │   ├── rules.ts
│       │   ├── game.ts
│       │   ├── events.ts
│       │   └── analysis.ts
│       │
│       ├── hooks/
│       │   ├── useAnalysis.ts
│       │   ├── useGameState.ts
│       │   └── useLocalStorage.ts
│       │
│       └── utils/
│           ├── cardFormatting.ts
│           ├── percentage.ts
│           └── assertions.ts
│
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt            # optional alternative
│   ├── .env.example
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── dependencies.py
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   ├── health.py
│       │   ├── validation.py
│       │   ├── analysis.py
│       │   ├── simulation.py
│       │   └── research.py
│       │
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── card.py
│       │   ├── rules.py
│       │   ├── table.py
│       │   ├── requests.py
│       │   ├── responses.py
│       │   └── errors.py
│       │
│       ├── domain/
│       │   ├── __init__.py
│       │   ├── card.py
│       │   ├── hand.py
│       │   ├── shoe.py
│       │   ├── rules.py
│       │   ├── table.py
│       │   ├── outcome.py
│       │   └── state.py
│       │
│       ├── engine/
│       │   ├── __init__.py
│       │   ├── shoe_builder.py
│       │   ├── state_builder.py
│       │   ├── hand_evaluator.py
│       │   ├── rule_engine.py
│       │   ├── dealer_engine.py
│       │   ├── transition_engine.py
│       │   └── validator.py
│       │
│       ├── probability/
│       │   ├── __init__.py
│       │   ├── distribution.py
│       │   ├── exact.py
│       │   ├── memoization.py
│       │   ├── hidden_cards.py
│       │   ├── monte_carlo.py
│       │   ├── confidence.py
│       │   └── strategy.py
│       │
│       ├── research/
│       │   ├── __init__.py
│       │   ├── definitions.py
│       │   ├── count_engine.py
│       │   ├── ace_side.py
│       │   ├── experiments.py
│       │   ├── metrics.py
│       │   └── export.py
│       │
│       └── utils/
│           ├── hashing.py
│           ├── timing.py
│           └── numeric.py
│
└── tests/
    ├── backend/
    │   ├── unit/
    │   │   ├── test_cards.py
    │   │   ├── test_shoe.py
    │   │   ├── test_hand_evaluator.py
    │   │   ├── test_rules.py
    │   │   ├── test_validator.py
    │   │   ├── test_exact_probability.py
    │   │   ├── test_hidden_cards.py
    │   │   ├── test_monte_carlo.py
    │   │   ├── test_confidence.py
    │   │   └── test_counts.py
    │   │
    │   └── integration/
    │       ├── test_validate_api.py
    │       ├── test_analyze_api.py
    │       ├── test_simulate_api.py
    │       └── test_research_api.py
    │
    └── frontend/
        ├── gameReducer.test.ts
        ├── CardPicker.test.tsx
        ├── RuleSetupForm.test.tsx
        └── AnalysisPanel.test.tsx
```

---

# 20. Root Files

## README.md

Human-readable project introduction.

Contains:

- project goal
- features
- setup summary
- high-level architecture
- educational scope

---

## THEORY.md

Contains:

- probability theory
- hidden variables
- exact recursion
- Monte Carlo
- confidence intervals
- research theory
- counting systems as compressed models

No UI implementation details should live here.

---

## TECHNICAL.md

This document.

Contains implementation decisions and software architecture.

---

## .gitignore

Should exclude:

```text
node_modules/
dist/
.venv/
__pycache__/
.pytest_cache/
.coverage
.env
*.pyc
.DS_Store
.vscode/
```

Do not commit secrets.

---

# 21. Frontend File Responsibilities

## frontend/src/main.tsx

Application entry point.

Responsibilities:

- create the React root
- mount `<App />`
- import global CSS
- optionally wrap providers

Should contain very little logic.

---

## frontend/src/App.tsx

Top-level application component.

Responsibilities:

- page routing/navigation
- application layout
- main providers

It should not implement blackjack mathematics.

---

## frontend/src/api/client.ts

Central HTTP client.

Responsibilities:

- store backend base URL
- send JSON requests
- parse responses
- normalize HTTP errors
- attach common headers

Example concept:

```ts
export async function apiPost<TRequest, TResponse>(
  path: string,
  body: TRequest
): Promise<TResponse> {
  ...
}
```

All API requests should pass through this file.

---

## frontend/src/api/analysisApi.ts

Functions such as:

```ts
validateState(...)
analyzeExact(...)
simulateMonteCarlo(...)
```

This prevents components from containing raw Fetch code.

---

## frontend/src/api/researchApi.ts

Handles:

```text
research comparison
batch experiments
research exports
```

---

## frontend/src/api/types.ts

API-facing TypeScript types.

Important:

Frontend domain types and API response types may be different.

This file defines the network contract.

---

# 22. UI Components

## BlackjackTable.tsx

Renders:

- dealer area
- seats
- user position
- table center
- shoe status

Should receive state through props/selectors.

Should not mutate state directly.

---

## DealerSeat.tsx

Renders:

- dealer cards
- hidden card
- dealer status
- controls for card entry when allowed

---

## PlayerSeat.tsx

Generic seat component.

Props may include:

```ts
seatNumber
cards
isUser
isActive
```

Use the same component for all surrounding players.

---

## CardView.tsx

Responsible only for displaying a card.

Input:

```ts
{
  rank: "K",
  suit: "hearts"
}
```

Output:

visual card.

It should know nothing about probabilities.

---

## ShoeStatus.tsx

Displays:

```text
configured decks
total initial cards
known cards
hidden cards
cards physically remaining
shoe progress
```

Use frontend-derived values for immediate display.

Backend validation remains authoritative.

---

## EventHistory.tsx

Displays the chronological event log.

Functions:

```text
inspect
undo
possibly replay later
```

---

# 23. Card Input Components

## CardPicker.tsx

Main card-selection dialog/panel.

Supports:

- four suits
- thirteen ranks
- remaining multiplicity display
- unknown card button
- target seat selection

---

## RankGrid.tsx

Responsible for rank layout.

No domain calculations.

---

## SuitRow.tsx

Displays cards belonging to one suit.

---

## UnknownCardButton.tsx

Creates an unknown-card event.

This must not invent a rank or suit.

---

# 24. Rule Components

## RuleSetupForm.tsx

Main configuration form.

Collects:

- deck count
- player count
- user seat
- dealer soft-17 behavior
- split settings
- double settings
- surrender settings
- other supported rule options

---

## DeckCountSelector.tsx

Options:

```text
1
2
3
4
5
6
7
8
Unknown
```

Represent unknown as:

```ts
null
```

or:

```ts
"unknown"
```

Use one convention consistently throughout the project.

---

## SeatSelector.tsx

Configures:

- number of active seats
- which seat represents the user

---

# 25. Analysis Components

## AnalysisPanel.tsx

Main results container.

Displays:

- exact results
- Monte Carlo results
- model uncertainty
- warnings
- computation metadata

---

## OutcomeProbability.tsx

Reusable display for:

```text
Win
Push
Loss
```

Input is decimal:

```ts
0.4382
```

UI converts it to:

```text
43.82%
```

---

## ConfidenceInterval.tsx

Only shown for an estimate that has sampling uncertainty.

Example:

```text
95% CI
43.51% – 44.13%
```

For exact calculations:

```text
Not applicable
```

---

## MethodSelector.tsx

Controls:

```text
Exact
Monte Carlo
Compare Both
```

Additional Monte Carlo settings:

```text
simulations
confidence level
seed
```

---

## ComputationMetadata.tsx

Optional technical diagnostics:

```text
runtime
states evaluated
cache hits
simulation count
seed
```

Useful for the course presentation.

---

# 26. Research Components

## ResearchPanel.tsx

Main research view.

Displays:

- exact reference
- selected count-model scores
- batch experiment settings
- model-comparison metrics

---

## CountComparisonTable.tsx

Side-by-side model comparison.

Example:

```text
Model         Score      Correlation
A             ...        ...
B             ...        ...
C             ...        ...
```

Do not combine model scores into one arbitrary value.

---

## CorrelationChart.tsx

Plots:

```text
count score
vs
exact probability
```

Only used with generated research data.

---

## ExperimentSettings.tsx

Controls:

```text
number of generated states
deck configuration
rule profile
random seed
state-depth distribution
```

---

# 27. Frontend Domain Types

## domain/card.ts

Define:

```ts
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type Suit =
  | "spades"
  | "hearts"
  | "diamonds"
  | "clubs";
```

Known card:

```ts
export interface KnownCard {
  kind: "known";
  rank: Rank;
  suit: Suit;
}
```

Unknown card:

```ts
export interface UnknownCard {
  kind: "unknown";
}
```

Union:

```ts
export type ObservedCard = KnownCard | UnknownCard;
```

This is safer than using `null` to represent several different meanings.

---

# 28. domain/rules.ts

Defines frontend rule state.

Example:

```ts
export interface BlackjackRules {
  decks: number | null;
  dealerSoft17: "hit" | "stand";
  doubleAfterSplit: boolean;
  surrender: "none" | "late";
  maxSplitHands: number;
  hitSplitAces: boolean;
}
```

Only include rule variants actually implemented.

---

# 29. domain/events.ts

Defines all game event types.

Prefer a discriminated union:

```ts
type GameEvent =
  | NewShoeEvent
  | DealKnownCardEvent
  | DealUnknownCardEvent
  | RemoveEvent
  | ShuffleEvent
  | RoundCompleteEvent;
```

Every event should have:

```text
id
type
sequence
```

Optional:

```text
timestamp
```

Timestamps are not mathematically necessary.

---

# 30. gameReducer.ts

The reducer is the frontend session-state engine.

Responsibilities:

- append events
- undo last event
- reset state
- update rules before lock
- reconstruct visible hands
- preserve deterministic behavior

Do not call APIs inside the reducer.

Reducers should remain pure functions.

---

# 31. selectors.ts

Contains derived frontend values.

Examples:

```ts
selectDealerCards(state)
selectPlayerCards(state, seat)
selectKnownCards(state)
selectUnknownCardCount(state)
selectVisibleRemainingMultiplicity(state)
```

Do not duplicate derivation logic across components.

---

# 32. persistence.ts

Responsible for localStorage.

Functions:

```ts
saveSession(...)
loadSession(...)
clearSession(...)
```

Include a persistence schema version:

```json
{
  "schemaVersion": 1,
  "data": {}
}
```

---

# 33. Backend Entry Point

## backend/app/main.py

Creates the FastAPI application.

Responsibilities:

- instantiate `FastAPI`
- register routers
- configure CORS
- install exception handlers
- application metadata

Conceptually:

```python
app = FastAPI(
    title="Blackjack Analysis API",
    version="1.0.0",
)
```

Avoid putting probability functions here.

---

# 34. backend/app/config.py

Central configuration.

Possible settings:

```text
environment
allowed frontend origins
maximum Monte Carlo simulations
exact-computation limits
debug logging
```

Read values from environment variables if needed.

---

# 35. backend/app/dependencies.py

Shared FastAPI dependencies.

Likely minimal in this project because there is:

- no authentication
- no database session

May eventually provide:

- computation settings
- request timer

---

# 36. Backend API Router Files

## api/health.py

Implements:

```text
GET /api/health
```

---

## api/validation.py

Implements:

```text
POST /api/validate
```

Calls:

```text
schemas
state_builder
validator
```

Does not implement validation logic itself.

---

## api/analysis.py

Implements exact analysis endpoint.

Flow:

```text
request
→ build state
→ validate
→ exact engine
→ serialize result
```

---

## api/simulation.py

Implements Monte Carlo endpoint.

Flow:

```text
request
→ build state
→ validate
→ simulation
→ confidence intervals
→ response
```

---

## api/research.py

Implements:

```text
model scores
batch comparison
metrics
research export
```

---

# 37. Pydantic Schemas

The `schemas/` package describes JSON input/output.

These are API schemas, not the internal calculation classes.

---

## schemas/card.py

Examples:

```python
class KnownCardSchema(BaseModel):
    rank: Rank
    suit: Suit

class UnknownCardSchema(BaseModel):
    unknown: Literal[True]
```

Use validation to reject invalid ranks/suits.

---

## schemas/rules.py

Validates incoming rules.

Examples:

```python
decks: int | None
dealer_soft_17: Literal["hit", "stand"]
max_split_hands: int
```

Deck values should be constrained if known.

Example:

```text
1 <= decks <= 8
```

---

## schemas/table.py

Defines:

```text
dealer
players
discard pile
seat numbers
user seat
```

---

## schemas/requests.py

Defines endpoint request payloads:

```text
ValidateRequest
ExactAnalysisRequest
MonteCarloRequest
ResearchCompareRequest
```

---

## schemas/responses.py

Defines stable output contracts:

```text
ValidationResponse
AnalysisResponse
MonteCarloResponse
ResearchResponse
```

---

## schemas/errors.py

Defines structured errors:

```python
class APIErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None
```

Never make the frontend parse arbitrary Python exception strings.

---

# 38. Internal Domain Models

API schemas should be converted to internal immutable domain types.

Why?

Because probability code should not depend directly on FastAPI or Pydantic.

This keeps the engine independently testable.

---

## domain/card.py

Python definitions:

```text
Rank enum
Suit enum
Card dataclass
```

Recommended:

```python
@dataclass(frozen=True, slots=True)
class Card:
    rank: Rank
    suit: Suit
```

`frozen=True` makes cards immutable.

---

## domain/hand.py

Represents a hand.

Possible fields:

```text
cards
origin
split metadata
completion status
```

Avoid permanently storing hand total if it can be derived.

---

## domain/shoe.py

Represents card multiplicities.

Recommended internal structure:

```python
tuple[int, ...]
```

or immutable mapping.

For memoized exact probability, immutable tuples are significantly easier to hash.

---

## domain/rules.py

Immutable rule profile.

Example:

```python
@dataclass(frozen=True)
class Rules:
    decks: int
    dealer_soft_17: DealerSoft17
    ...
```

Unknown deck count should be resolved before entering an exact single-model calculation.

---

## domain/outcome.py

Define terminal outcomes:

```text
WIN
PUSH
LOSS
```

and an `OutcomeDistribution`.

Example:

```python
@dataclass(frozen=True)
class OutcomeDistribution:
    win: float
    push: float
    loss: float
```

Methods can include:

```text
normalize
validate
weighted_add
```

---

## domain/state.py

Canonical game state passed to probability functions.

This is one of the most important objects.

It may contain:

```text
shoe composition
dealer state
user hand state
other relevant hands
rules
hidden-state representation
phase
```

Keep it immutable where possible.

---

# 39. Shoe Engine

## engine/shoe_builder.py

Responsibilities:

- build a fresh 1–8 deck shoe
- produce exact-card multiplicities
- produce rank-compressed form
- remove known cards
- detect impossible multiplicities

Functions might include:

```python
build_full_shoe(decks)
remove_card(shoe, card)
remove_cards(shoe, cards)
compress_to_ranks(shoe)
```

---

# 40. State Builder

## engine/state_builder.py

Converts incoming API state into canonical internal state.

Flow:

```text
Pydantic request
     ↓
collect all events/cards
     ↓
construct fresh shoe
     ↓
remove known cards
     ↓
record unknown-card count
     ↓
build hands
     ↓
create canonical state
```

This should be the only place that translates network representation into calculation representation.

---

# 41. Hand Evaluator

## engine/hand_evaluator.py

Pure mathematical functions.

Responsibilities:

- card numeric values
- ace conversion
- total
- soft/hard status
- bust detection
- natural blackjack
- pair detection

Example output:

```python
@dataclass(frozen=True)
class HandValue:
    total: int
    soft: bool
    bust: bool
    blackjack: bool
```

Pure functions make testing straightforward.

---

# 42. Rules Engine

## engine/rule_engine.py

Determines legal and required transitions.

Examples:

```text
must dealer hit?
must dealer stand?
can hand split?
can hand double?
is surrender allowed?
```

Functions:

```python
dealer_action(hand_value, rules)
legal_actions(hand, state, rules)
```

The rules engine should not itself draw random cards.

---

# 43. Dealer Engine

## engine/dealer_engine.py

Coordinates dealer progression.

Responsibilities:

- evaluate dealer hand
- apply H17/S17 rule
- expose terminal distribution
- call probability recursion where appropriate

Keep dealer policy logic separate from general transitions.

---

# 44. Transition Engine

## engine/transition_engine.py

Creates successor states.

Given:

```text
current state
+
possible card
```

returns:

```text
new state
```

This is central to exact recursion.

Function concept:

```python
def draw_transition(
    state: GameState,
    rank: Rank,
) -> GameState:
    ...
```

It must decrement the remaining count exactly once.

---

# 45. Validator

## engine/validator.py

Canonical source of state validity.

Validation groups:

### Physical validation

```text
card multiplicity
total cards
unknown cards
deck count
```

### Rule validation

```text
supported rule combinations
```

### Phase validation

```text
actions legal in current phase
```

### Probability validation

```text
state has enough information for chosen method
```

Return structured issues rather than immediately raising generic exceptions.

---

# 46. Probability Package

The probability package contains **only probability-related computation**.

It should not know about React.

It should not know about HTTP.

---

# 47. probability/distribution.py

Core probability helper types.

Example:

```python
@dataclass(frozen=True)
class ProbabilityMass:
    value: float
```

More importantly:

```python
@dataclass(frozen=True)
class OutcomeDistribution:
    win: float
    push: float
    loss: float
```

Utility:

```python
def weighted_sum(
    branches: Iterable[tuple[float, OutcomeDistribution]]
) -> OutcomeDistribution:
    ...
```

---

# 48. probability/exact.py

Implements exact recursive analysis.

Conceptual flow:

```python
def evaluate(state):
    if state_is_terminal(state):
        return terminal_distribution(state)

    result = zero_distribution()

    for possible_card, count in possible_draws(state.shoe):
        probability = count / state.shoe.total

        next_state = transition(state, possible_card)

        branch = evaluate(next_state)

        result += probability * branch

    return result
```

The real implementation should use memoization.

---

# 49. probability/memoization.py

Contains canonical state keys and cache helpers.

Example state key:

```text
remaining rank tuple
player total representation
dealer representation
rule identifiers
hidden-state identifiers
phase
```

Important:

Two mathematically equivalent states should produce the same cache key.

Avoid including irrelevant UI details such as:

```text
seat display name
card animation state
event timestamps
```

---

# 50. Cache Lifetime

For the MVP, use **request-local or process-memory caching**.

Possible implementations:

```python
functools.lru_cache
```

or an explicit dictionary.

The cache is not a database.

It can disappear when:

- the process restarts
- the cache is cleared
- the function exits, depending on design

This is acceptable because every result can be recomputed.

---

# 51. Cache Safety

If a global `lru_cache` is used:

- every function argument must be immutable/hashable
- rules must be included in the key
- hidden-state information must be included
- no mutable state may be referenced implicitly

Otherwise stale/wrong probabilities could be returned.

A safer first version may create a computation object with a per-analysis memo dictionary.

---

# 52. probability/hidden_cards.py

Responsible for uncertainty in hidden card identity.

Functions may include:

```python
hidden_card_distribution(...)
enumerate_hidden_states(...)
sample_hidden_state(...)
```

Exact mode:

```text
enumerate and weight possible hidden states
```

Monte Carlo mode:

```text
sample a hidden state according to its probability
```

This file should contain no UI assumptions.

---

# 53. probability/monte_carlo.py

Monte Carlo engine.

Responsibilities:

- accept canonical state
- accept simulation count
- accept random seed
- sample hidden information
- simulate future cards without replacement
- record terminal outcomes
- aggregate counts

Return raw statistics:

```python
wins
pushes
losses
n
```

Confidence calculation belongs in another file.

---

# 54. Random Number Generator

Do not use a global random state implicitly.

Preferred approach:

```python
rng = random.Random(seed)
```

Pass `rng` through simulation functions.

Benefits:

- reproducibility
- testability
- no cross-request interference
- deterministic seeded experiments

For very large vectorized experiments, NumPy's `Generator` can be used instead.

---

# 55. probability/confidence.py

Responsible only for confidence intervals.

Functions:

```python
wilson_interval(successes, trials, confidence)
```

Input:

```text
integer success count
integer simulation count
confidence level
```

Output:

```text
lower
upper
```

The exact engine must not call this module.

---

# 56. probability/strategy.py

This file should be understood as **analysis orchestration**, not real-world wagering strategy.

It may decide:

```text
exact
Monte Carlo
compare both
```

based on request options.

Possible rename if desired:

```text
analysis_mode.py
```

That name may be clearer.

---

# 57. Research Package

The research package is intentionally separate from the core exact engine.

It should be possible to delete `research/` without breaking the basic simulator.

---

# 58. research/definitions.py

Stores configurable scoring-system definitions.

Example architecture:

```python
@dataclass(frozen=True)
class CountDefinition:
    id: str
    label: str
    rank_weights: tuple[float, ...]
    supports_ace_side: bool
```

The actual definitions should be sourced from instructor-approved references.

Keeping them data-driven prevents hard-coding model logic throughout the engine.

---

# 59. research/count_engine.py

Generic scoring function.

Conceptually:

```python
def calculate_running_score(
    observed_ranks,
    definition,
) -> float:
    ...
```

One engine should support multiple definitions.

Do not make separate large implementations for each count system unless their mathematics truly requires it.

---

# 60. research/ace_side.py

Computes ace-related research features.

Examples:

```text
aces observed
aces remaining
ace proportion
```

This remains separate from the primary count score.

---

# 61. research/experiments.py

Generates offline research datasets.

Responsibilities:

- generate valid simulated shoe states
- call exact engine
- call count models
- record features
- respect seed
- optionally stratify by shoe progress

This may be the most computationally expensive research module.

---

# 62. research/metrics.py

Statistical metrics:

```text
Pearson correlation
Spearman correlation
MAE
RMSE
Brier score where applicable
```

Do not place these calculations inside React.

---

# 63. research/export.py

Optional file export:

```text
CSV
JSON
```

Example research CSV columns:

```text
state_id
seed
decks
cards_remaining
shoe_progress
exact_win_probability
model_a_score
model_b_score
model_c_score
aces_remaining
```

Exports can be generated temporarily and returned as a download.

No database is required.

---

# 64. Data Flow — Card Entry

Example:

The user clicks:

```text
Dealer
→ King
→ Hearts
```

Flow:

```text
CardPicker
    ↓
dispatch DEAL_KNOWN_CARD
    ↓
gameReducer
    ↓
event appended
    ↓
selectors recompute visible table
    ↓
UI updates immediately
```

No backend request is strictly needed for every click.

When analysis is requested:

```text
frontend state
    ↓
serialize request
    ↓
POST /api/analyze
    ↓
backend reconstructs canonical state
    ↓
validation
    ↓
probability computation
    ↓
JSON response
    ↓
React result state
    ↓
AnalysisPanel renders
```

---

# 65. Data Flow — Unknown Card

```text
User clicks "?"
        ↓
UNKNOWN_CARD_DEALT event
        ↓
frontend displays hidden card
        ↓
request includes hidden-card count/position
        ↓
backend does NOT assign an arbitrary card
        ↓
hidden_cards.py
        ↓
exact marginalization
or
Monte Carlo hidden-state sampling
```

---

# 66. Data Flow — Exact Analysis

```text
POST /api/analyze
       ↓
Pydantic validation
       ↓
state_builder.py
       ↓
validator.py
       ↓
canonical GameState
       ↓
exact.py
       ↓
terminal?
  ┌────┴────┐
 yes        no
  │          │
return    enumerate
outcome   next cards
             ↓
       transition_engine
             ↓
        recursive call
             ↓
          cache
             ↓
 weighted branch sum
             ↓
 OutcomeDistribution
             ↓
 API response
```

---

# 67. Data Flow — Monte Carlo

```text
POST /api/simulate
       ↓
validate state/options
       ↓
create seeded RNG
       ↓
repeat N times:
    sample hidden state
    copy compact shoe state
    simulate valid future
    classify outcome
       ↓
aggregate counts
       ↓
confidence.py
       ↓
response
```

---

# 68. Probability Representation

Use Python `float` for initial implementation.

Store probabilities internally in:

```text
0.0 <= p <= 1.0
```

Examples:

```python
0.5
0.438271
1.0
```

Never internally use:

```text
50
43.8271
100
```

to mean percentages.

Convert only for UI.

---

# 69. Probability Invariants

Every exact result must satisfy approximately:

```python
0 <= win <= 1
0 <= push <= 1
0 <= loss <= 1
```

and:

```python
abs((win + push + loss) - 1.0) <= tolerance
```

Recommended tolerance:

```python
1e-10
```

or another documented tolerance determined by implementation behavior.

---

# 70. Exact Rational Arithmetic

Optional future enhancement:

Python `fractions.Fraction` can represent exact rational probabilities.

Example:

```python
Fraction(3, 51)
```

Advantages:

- mathematically exact

Disadvantages:

- considerably slower
- large numerator/denominator growth

Recommendation:

Use `float` in the main engine.

Use `Fraction` only in small unit tests if useful for verification.

---

# 71. Unknown Deck Count Architecture

A single exact state needs a known shoe size.

Therefore `decks = unknown` should be handled by an outer orchestration layer.

Flow:

```text
unknown decks
    ↓
for d in 1..8:
    build state assuming d
    validate
    analyze
    store result
    ↓
return scenario array
```

Response:

```json
{
  "model_uncertainty": "deck_count",
  "scenarios": [
    {"decks": 1, "outcomes": {...}},
    {"decks": 2, "outcomes": {...}}
  ]
}
```

Do not force unknown deck count into the core shoe class.

---

# 72. Rule-Uncertainty Architecture

Use the same pattern.

If a rule is unknown:

```text
scenario A: stand soft 17
scenario B: hit soft 17
```

Return separate results.

This is cleaner than allowing three-valued logic deep inside every rule function.

---

# 73. Validation Before Computation

Every analysis request must perform:

```text
schema validation
       ↓
physical card validation
       ↓
rule validation
       ↓
state/phase validation
       ↓
analysis
```

Never begin a large Monte Carlo calculation before confirming that the input is valid.

---

# 74. Error Codes

Use stable machine-readable error codes.

Examples:

```text
INVALID_DECK_COUNT
TOO_MANY_CARD_COPIES
UNKNOWN_CARDS_EXCEED_REMAINING
INVALID_SEAT
INVALID_RULE_COMBINATION
INVALID_PHASE
UNSUPPORTED_STATE
EXACT_COMPUTATION_LIMIT
SIMULATION_LIMIT_EXCEEDED
```

Frontend maps them to readable messages.

---

# 75. API Error Response

Recommended shape:

```json
{
  "error": {
    "code": "TOO_MANY_CARD_COPIES",
    "message": "This state contains too many copies of K♥.",
    "details": {
      "card": "KH",
      "observed": 7,
      "maximum": 6
    }
  }
}
```

---

# 76. Computational Limits

Exact recursion can grow very large.

Add configurable limits.

Example environment values:

```text
MAX_EXACT_STATES=2000000
MAX_MONTE_CARLO_RUNS=1000000
```

These are implementation safeguards, not mathematical constants.

If exact analysis exceeds the configured limit, return:

```text
exact calculation too large for configured limit
```

and allow the UI to use Monte Carlo instead.

---

# 77. Synchronous vs Background Computation

For the course MVP:

Use normal synchronous request/response endpoints.

Why:

- simpler
- no task queue
- no Redis
- no database
- easier demonstration

If a calculation becomes too slow, improve the algorithm or cap the request.

Do not introduce Celery/Redis unless measurements prove they are necessary.

---

# 78. Optional Progress Streaming

A later enhancement may use:

```text
Server-Sent Events (SSE)
```

for long Monte Carlo experiments.

Possible endpoint:

```text
POST /api/research/batch/start
GET  /api/research/batch/{id}/events
```

This is **not required for the MVP**.

Avoid WebSockets unless two-way real-time communication becomes necessary.

---

# 79. CORS

During development, React and FastAPI use different ports.

FastAPI should allow only the development frontend origin.

Example:

```text
http://localhost:5173
```

Do not use unrestricted `*` in deployed environments unless intentionally required.

---

# 80. Environment Variables

Backend `.env.example` may contain:

```text
APP_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
MAX_MONTE_CARLO_RUNS=1000000
MAX_EXACT_STATES=2000000
LOG_LEVEL=INFO
```

Frontend `.env.example`:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

No secrets are expected in this project.

---

# 81. Logging

Use Python's standard `logging`.

Log:

```text
request type
analysis method
simulation count
runtime
state count
cache stats
validation failures
unexpected exceptions
```

Do not log unnecessary user/device information.

Do not log full IP histories.

---

# 82. Performance Timing

Use:

```python
time.perf_counter()
```

to measure computation time.

Return optional metadata:

```json
{
  "runtime_ms": 183,
  "states_evaluated": 18234,
  "cache_hits": 42102
}
```

This is useful for explaining dynamic programming during the course presentation.

---

# 83. Memoization Metrics

The exact engine should optionally count:

```text
recursive calls
unique states
cache hits
cache misses
maximum recursion depth
```

These statistics can demonstrate why memoization matters.

---

# 84. Avoiding Python Recursion Limits

If recursion depth can become significant:

- ensure terminal rules keep paths bounded
- test deep states
- consider explicit stacks only if required

Dealer-hand recursion should normally remain shallow.

Complex split state trees may require careful implementation.

Do not increase Python's global recursion limit without understanding why.

---

# 85. Parallel Monte Carlo

Do not start with multiprocessing.

Initial approach:

```text
single Python process
optimized loops
optional NumPy
```

If profiling later shows Monte Carlo is too slow, possible enhancements include:

```text
multiprocessing
ProcessPoolExecutor
NumPy vectorization
Numba
```

Only optimize after measuring.

---

# 86. Profiling

Use built-in tools first.

Possible:

```text
cProfile
time.perf_counter
pytest-benchmark
```

Measure:

```text
exact analysis runtime
unique states
cache hit rate
Monte Carlo runs/second
```

---

# 87. Testing Strategy

Tests should be divided into:

```text
unit
integration
frontend component
property/invariant
research reproducibility
```

---

# 88. Backend Unit Tests

## test_cards.py

Test:

- valid ranks
- valid suits
- equality
- hashing

---

## test_shoe.py

Test:

```text
1 deck = 52
6 decks = 312
8 decks = 416
correct multiplicities
known removal
reset
```

---

## test_hand_evaluator.py

Test:

```text
hard total
soft total
multiple aces
blackjack
ordinary 21
bust
pair
```

Important examples:

```text
A + 6 = soft 17
A + 6 + 9 = hard 16
A + A + 9 = 21
```

---

# 89. Rule Tests

`test_rules.py`

Test supported rule transitions independently.

Examples:

```text
S17 dealer stops on soft 17
H17 dealer continues on soft 17
split restriction
double restriction
```

---

# 90. Probability Unit Tests

`test_exact_probability.py`

Start with tiny synthetic shoes.

Example:

```text
remaining shoe:
King × 3
Five × 1
```

Then verify:

```text
P(King) = 3/4
P(Five) = 1/4
```

Small controlled shoes are easier to prove manually.

---

# 91. Hidden-Card Tests

`test_hidden_cards.py`

Cases:

```text
one completely unknown removed card
two hidden cards
known evidence affecting hidden distribution
```

Verify total probability.

---

# 92. Monte Carlo Tests

Monte Carlo is random, so do not require an exact decimal match.

Use:

- fixed seed
- controlled state
- sufficiently large sample
- acceptable error tolerance

Also verify:

```text
same seed → same result
different seed → normally different simulated sequence
```

---

# 93. Confidence Tests

Known test cases for Wilson intervals.

Verify:

```text
0 <= lower <= upper <= 1
```

and selected confidence levels.

---

# 94. API Integration Tests

Use FastAPI's test client.

Test:

```text
valid request → 200
invalid physical state → 4xx
unknown deck → scenario response
Monte Carlo request → confidence information
```

---

# 95. Frontend Tests

## gameReducer.test.ts

Test:

```text
deal card
unknown card
undo
reset
new shoe
```

Reducer tests should not require the browser.

---

## CardPicker.test.tsx

Test:

```text
renders ranks
renders suits
unknown option
disabled exhausted card
```

---

## RuleSetupForm.test.tsx

Test:

```text
deck selection
unknown selection
seat selection
rule changes
```

---

## AnalysisPanel.test.tsx

Test:

```text
exact result display
Monte Carlo CI display
loading
error
model-uncertainty scenarios
```

---

# 96. Property-Based Tests

Good invariants:

For any valid generated shoe:

```text
all counts >= 0
sum(counts) == remaining cards
```

For any completed probability distribution:

```text
sum(outcomes) ≈ 1
```

For any legal draw:

```text
remaining total decreases exactly by 1
```

---

# 97. Research Reproducibility Tests

Given:

```text
same seed
same experiment configuration
same code
```

the experiment should produce the same generated dataset or deterministic simulation sequence.

Store test fixtures for small experiments.

---

# 98. Formatting and Code Quality

Frontend:

```text
ESLint
Prettier
TypeScript strict mode
```

Backend:

```text
Ruff
Black
mypy optional
```

Recommended Python style:

- type hints
- dataclasses
- pure functions where possible
- no giant service classes

---

# 99. TypeScript Strictness

Enable:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

This is especially useful because the project contains multiple meanings of:

```text
known card
unknown card
unknown deck
optional rule
```

Strong typing prevents accidental mixing.

---

# 100. Python Typing

Use:

```python
from typing import Literal, TypeAlias
```

and enums/dataclasses where useful.

Run static checking later if desired.

Probability functions should have explicit return types.

---

# 101. Dependency Management

Python options:

### Simple option

```text
requirements.txt
```

### Preferred structured option

```text
pyproject.toml
```

Use one authoritative dependency definition.

Avoid maintaining two unsynchronized lists.

---

# 102. Suggested Python Dependencies

Initial:

```text
fastapi
uvicorn[standard]
pydantic
pytest
httpx
```

Optional later:

```text
numpy
scipy
pandas
pytest-cov
hypothesis
```

Do not install heavy packages until actually needed.

---

# 103. Suggested Frontend Dependencies

Core:

```text
react
react-dom
typescript
vite
```

Development:

```text
vitest
@testing-library/react
@testing-library/jest-dom
eslint
prettier
```

Optional:

```text
react-router-dom
recharts
```

---

# 104. Local Development

Backend:

```bash
cd backend
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

or the chosen `pyproject.toml` workflow.

Start:

```bash
uvicorn app.main:app --reload --port 8000
```

---

# 105. Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Expected development URL:

```text
http://localhost:5173
```

---

# 106. Frontend Build

```bash
npm run build
```

Output:

```text
frontend/dist/
```

---

# 107. Deployment Options

The project can be deployed in several ways.

## Option A — Two Services

Frontend:

```text
Vercel / Netlify / static hosting
```

Backend:

```text
Render / Railway / Fly.io / similar Python host
```

The frontend receives the backend URL through:

```text
VITE_API_BASE_URL
```

---

## Option B — FastAPI Serves React Build

For a simple classroom deployment:

1. Build React.
2. Copy `dist/` into backend static directory.
3. FastAPI serves the frontend.
4. API lives under `/api`.

Advantages:

- one deployed service
- no CORS in production
- simpler demonstration

This may be the easiest final presentation setup.

---

# 108. Docker

Docker is optional.

Possible future files:

```text
backend/Dockerfile
frontend/Dockerfile
docker-compose.yml
```

Do not add Docker until basic local development works.

For a course project, Docker is useful but not mandatory.

---

# 109. No Database Decision

A database is intentionally omitted because current requirements do not require durable shared data.

We do not need:

```text
users
accounts
passwords
server history
payments
casino records
persistent sessions
```

The state can be reconstructed from the event list.

---

# 110. When a Database Would Become Necessary

Only add one if requirements later include:

```text
user accounts
saved experiments across devices
shared experiments
classroom leaderboards
persistent server-side research datasets
audit history
```

If that happens, SQLite would be the first simple option.

But it is not part of the MVP.

---

# 111. Research Data Storage

Batch experiments do not require a database.

Possible approaches:

### In Memory

For small experiments.

### CSV

For research datasets.

### JSON

For exact state/replay export.

### Parquet

Optional for very large tabular experiments.

For the course project, CSV is usually enough.

---

# 112. Replay File Format

Optional replay export:

```json
{
  "schema_version": 1,
  "rules": {...},
  "events": [...]
}
```

A replay should contain state inputs, not cached probability outputs.

Why?

Because probabilities should be reproducible from the state and current engine.

Optional results can be stored as metadata but are not the source of truth.

---

# 113. Canonical Source of Truth

For an interactive session:

```text
rules
+
event log
```

are the canonical source of truth.

Derived values include:

```text
hands
remaining shoe
visible counts
probabilities
research scores
```

Do not independently persist all derived values because they can become inconsistent.

---

# 114. Result Freshness

Every analysis result should identify the state it was calculated from.

Frontend can create a state revision:

```text
revision = event count + rule revision
```

When the user changes a card after an analysis:

```text
analysis result becomes stale
```

UI should either:

- clear the old result
- or mark it stale

Never display an old probability as if it represents the new state.

---

# 115. State Hash

Optional backend improvement:

Create a deterministic hash of the canonical state.

Example:

```text
SHA-256(canonical serialized state)
```

Return:

```json
{
  "state_hash": "..."
}
```

Useful for:

- caching
- reproducibility
- debugging
- proving two analyses used the same state

Not security-critical.

---

# 116. API Versioning

Start endpoints under:

```text
/api
```

If breaking API changes occur later:

```text
/api/v1
```

could be introduced.

For the course MVP, explicit `v1` is optional.

---

# 117. Schema Versioning

Replay/localStorage data should include:

```text
schema_version
```

because stored events may outlive code changes.

Example:

```json
{
  "schema_version": 1
}
```

---

# 118. Security

The project has a small attack surface because it has:

- no authentication
- no database
- no payments
- no file uploads required
- no secrets

Still implement:

- strict Pydantic validation
- request size limits where appropriate
- bounded simulation counts
- controlled CORS
- escaped UI rendering
- no dynamic `eval`
- no arbitrary Python execution

---

# 119. Privacy

Do not collect:

```text
name
email
location
device identifiers
casino account information
payment information
```

No analytics are required.

Logs should focus on technical operation.

---

# 120. Accessibility

Frontend should include:

- keyboard-accessible card picker
- visible focus state
- text labels in addition to suit color
- symbols plus accessible names
- button labels
- sufficient contrast

Do not communicate suit or state using color alone.

---

# 121. Responsive Design

Primary target:

```text
desktop / laptop
```

because the table and research panels are information dense.

Still make it responsive enough for tablets.

On smaller screens:

```text
table seats may stack
analysis panel moves below table
card picker can scroll
```

---

# 122. UI Performance

React should not rerender the entire app unnecessarily.

Use:

- small components
- selectors
- stable IDs
- memoization only after measuring

Do not prematurely add complex frontend optimization.

The heavy computation is Python-side.

---

# 123. Cancellation

If the user starts a new analysis before the previous HTTP request finishes, use `AbortController` on the frontend.

Concept:

```ts
const controller = new AbortController();

fetch(url, {
  signal: controller.signal
});
```

This prevents stale responses from replacing newer results.

---

# 124. Request Debouncing

Do not run exact probability automatically after every card click in the first implementation.

Better:

```text
enter cards
↓
click Analyze
```

This:

- reduces CPU use
- avoids unnecessary network traffic
- is easier to debug

A later "auto analyze" toggle can debounce requests.

---

# 125. Analysis Status

Possible frontend states:

```ts
"idle"
"validating"
"calculating"
"success"
"error"
```

Do not use one Boolean such as:

```ts
loading: true/false
```

if multiple states become difficult to distinguish.

---

# 126. Exact vs Monte Carlo Fallback

Recommended behavior:

User selects:

```text
Compare Both
```

Backend can:

1. attempt exact analysis
2. run Monte Carlo
3. return both when exact is feasible

If exact exceeds resource limit:

```json
{
  "exact": {
    "status": "unavailable",
    "reason": "state_limit"
  },
  "monte_carlo": {
    "status": "complete",
    "...": "..."
  }
}
```

Do not silently replace exact mode with simulation without telling the UI.

---

# 127. Batch Experiment Architecture

Research batch experiments should be decoupled from table UI.

Concept:

```python
ExperimentConfig
    ↓
StateGenerator
    ↓
for each generated state:
    exact result
    count features
    metadata
    ↓
DataFrame/list of rows
    ↓
metrics
    ↓
CSV/JSON
```

---

# 128. ExperimentConfig

Possible fields:

```text
seed
number_of_states
deck_counts
rule_profiles
minimum_shoe_progress
maximum_shoe_progress
include_hidden_cards
```

Research defaults should be explicit and reproducible.

---

# 129. Research State Generator

Generate physically valid states by simulating removals from a real virtual shoe.

Do not generate rank counts independently because that can produce impossible compositions.

Correct:

```text
build real shoe
shuffle/sample
remove cards
capture state
```

---

# 130. Count Definitions as Data

Preferred structure:

```python
COUNT_DEFINITIONS = {
    "model_a": CountDefinition(...),
    "model_b": CountDefinition(...),
}
```

or JSON/YAML if the instructor wants to modify definitions without changing Python.

If using JSON:

```text
backend/app/research/data/count_definitions.json
```

Validation must verify:

```text
all expected ranks exist
weights are numeric
ID is unique
```

---

# 131. Should We Use JSON or Python for Count Definitions?

Recommendation for MVP:

Use Python dataclasses/constants.

Reasons:

- simpler
- typed
- tested
- no extra parser

Use JSON later only if runtime configurability is needed.

---

# 132. Where Formula Logic Lives

Do not put formulas in:

```text
React components
API routers
Pydantic schemas
```

Put formulas in:

```text
probability/
research/
engine/
```

depending on responsibility.

Example:

```text
Wilson interval → probability/confidence.py
hand total → engine/hand_evaluator.py
count score → research/count_engine.py
```

---

# 133. No Circular Dependencies

Recommended dependency direction:

```text
schemas → domain conversion
api → engine/probability/research
probability → engine/domain
engine → domain
research → probability/domain
domain → nothing application-specific
```

Avoid:

```text
domain importing api
engine importing FastAPI
probability importing React concepts
```

---

# 134. Dependency Rule

Lower-level modules must not know about higher-level modules.

Desired:

```text
API
 ↓
Services / probability
 ↓
Engine
 ↓
Domain
```

Not:

```text
Domain
 ↑↓
API
```

This keeps the code maintainable.

---

# 135. Serialization Boundary

Only API schemas should care about JSON-specific formats such as:

```text
"KH"
"AS"
```

Internally prefer enums/objects.

Conversion happens once:

```text
request schema
→ domain
```

and:

```text
domain result
→ response schema
```

---

# 136. Card Encoding

Recommended API compact card code:

```text
AS  = Ace of Spades
10H = Ten of Hearts
QD  = Queen of Diamonds
KC  = King of Clubs
```

Suit codes:

```text
S H D C
```

Unknown card:

Do not overload a fake code like `"XX"` everywhere.

Prefer an explicit schema:

```json
{
  "kind": "unknown"
}
```

This prevents accidental treatment as a known card.

---

# 137. Domain Enum Example

Python:

```python
class Rank(str, Enum):
    ACE = "A"
    TWO = "2"
    ...
    KING = "K"
```

Suit:

```python
class Suit(str, Enum):
    SPADES = "S"
    HEARTS = "H"
    DIAMONDS = "D"
    CLUBS = "C"
```

---

# 138. Shoe Representation Choices

## Option 1 — List of Cards

```python
list[Card]
```

Easy but slower for exact recursion.

## Option 2 — Counter

```python
Counter[Rank]
```

Simple and expressive.

## Option 3 — Immutable Tuple of Counts

```python
tuple[int, ...]
```

Best for memoized exact state.

Recommendation:

Use exact-card counts while validating/reconstructing.

Convert to a compact immutable tuple for heavy probability calculations.

---

# 139. Rank Index Mapping

Example:

```text
0  A
1  2
2  3
3  4
4  5
5  6
6  7
7  8
8  9
9  10
10 J
11 Q
12 K
```

A tuple:

```python
(24, 24, 24, ..., 24)
```

represents a fresh six-deck shoe by rank.

If ten/J/Q/K can safely be combined for a calculation, a separate compact representation may be used internally.

The conversion must be tested.

---

# 140. Why Exact Suit Tracking Still Exists

Even if probability calculation compresses suits, the input layer must track exact cards because:

```text
K♥
K♠
K♦
K♣
```

are physically distinct.

A six-deck shoe has six copies of each exact card.

The validator needs exact multiplicity.

---

# 141. Hand Representation in Cache Key

Do not use original card order if order does not affect future state.

Canonicalize hands.

Example:

Instead of:

```text
["AS", "6H"]
```

vs:

```text
["6H", "AS"]
```

creating two different state keys, convert to a canonical mathematical representation.

This increases cache hits.

---

# 142. Rule Representation in Cache Key

Every rule that can affect future probability must be part of the key.

Examples:

```text
soft-17 rule
split status
split-ace restriction
```

If omitted, the cache could return a result calculated under different rules.

---

# 143. Hidden State in Cache Key

Likewise include:

```text
unknown-card count
known constraints on hidden cards
```

Otherwise mathematically different states could collide.

---

# 144. Numeric Output Precision

Backend may return 8–12 decimal digits naturally as JSON numbers.

Frontend display:

Default:

```text
2 decimal places
```

Optional advanced view:

```text
4–6 decimal places
```

Never round before further calculations.

---

# 145. Charts

Recommended research charts:

```text
Monte Carlo convergence
count score vs exact probability
correlation comparison
error distribution
calibration plot
```

Charts should consume backend-generated research data.

The frontend should not recompute statistical metrics independently.

---

# 146. Export

Possible buttons:

```text
Export experiment CSV
Export replay JSON
Export analysis JSON
```

CSV for tabular research.

JSON for structured replay/analysis.

---

# 147. Methodology Page

The Methodology page can be static frontend content loaded from maintained project documentation.

It should explain:

- exact vs Monte Carlo
- confidence interval
- hidden information
- rule assumptions
- research model comparison

Avoid duplicating full Markdown rendering initially unless needed.

---

# 148. Version Information

Expose application version in:

```text
footer
about panel
API health response
```

Example:

```json
{
  "version": "0.1.0"
}
```

This helps reproduce research results.

---

# 149. Git Workflow

Recommended branches:

```text
main
feature/<name>
fix/<name>
```

Commit separate logical units:

```text
shoe model
hand evaluator
API schemas
exact engine
Monte Carlo
frontend table
```

Do not implement the whole application in one unreviewable commit.

---

# 150. CI

Optional GitHub Actions workflow:

```text
frontend:
    npm ci
    npm test
    npm run build

backend:
    install
    pytest
```

This is useful before final submission.

---

# 151. Recommended Implementation Phases

## Phase 1 — Repository Foundation

Create:

```text
frontend
backend
tests
README
THEORY
TECHNICAL
```

Configure:

```text
React
TypeScript
Vite
FastAPI
pytest
```

Acceptance:

```text
frontend loads
backend health endpoint works
frontend can call health endpoint
```

---

## Phase 2 — Domain Model

Implement:

```text
Card
Rank
Suit
Rules
Shoe
Hand
Outcome
GameState
```

Acceptance:

```text
unit tests pass
fresh shoes have exact correct counts
```

---

## Phase 3 — Frontend Session State

Implement:

```text
event model
reducer
setup
seat selection
card picker
undo
reset
```

No probability yet.

Acceptance:

```text
user can reproduce an observed table state correctly
```

---

## Phase 4 — Backend Reconstruction & Validation

Implement:

```text
state builder
shoe removal
unknown cards
validator
/api/validate
```

Acceptance:

```text
valid states accepted
impossible states rejected
```

---

## Phase 5 — Hand & Dealer Engine

Implement:

```text
hand values
aces
blackjack
bust
dealer H17/S17
rule transitions
```

Acceptance:

```text
comprehensive rule tests pass
```

---

## Phase 6 — Exact Probability

Implement:

```text
transition engine
exact recursion
outcome distribution
memoization
```

Start with simplified states and expand.

Acceptance:

```text
small manual test cases match expected math
probabilities sum to 1
```

---

## Phase 7 — Hidden Information

Implement:

```text
unknown card distribution
marginalization
unknown card testing
```

Acceptance:

```text
hidden-card results match analytical small examples
```

---

## Phase 8 — Monte Carlo

Implement:

```text
seeded RNG
sampling without replacement
simulation loop
outcome aggregation
```

Acceptance:

```text
Monte Carlo converges toward exact result on known test states
```

---

## Phase 9 — Confidence Intervals

Implement:

```text
Wilson interval
90%
95%
99%
```

Acceptance:

```text
known statistical test cases pass
```

---

## Phase 10 — Analysis UI

Connect:

```text
Analyze button
method selector
probability results
confidence intervals
loading/error states
```

---

## Phase 11 — Unknown Deck & Rule Sensitivity

Implement scenario orchestration.

Acceptance:

```text
unknown deck produces separate valid scenario results
```

---

## Phase 12 — Research Counts

Implement configurable instructor-approved score definitions.

Acceptance:

```text
same simulated state produces deterministic model scores
```

---

## Phase 13 — Batch Research

Implement:

```text
state generator
exact target
count features
metrics
CSV
charts
```

---

## Phase 14 — Optimization

Profile first.

Then improve:

```text
canonical states
rank compression
memoization
vectorized simulation if justified
```

---

## Phase 15 — Final Hardening

Complete:

```text
tests
accessibility
documentation
error handling
deployment
presentation data
```

---

# 152. Definition of Done

The project is technically complete when:

- React frontend runs
- FastAPI backend runs
- no database is required
- 1–8 deck known state works
- unknown deck scenario works
- known card entry works
- unknown card entry works
- seats are configurable
- event history works
- undo works
- rules are configurable
- impossible states are rejected
- exact probability works on supported states
- memoization works
- Monte Carlo works
- seeds reproduce experiments
- Wilson confidence intervals work
- exact results are not given sampling CIs
- research score models are configurable
- batch experiments can compare models
- test suite passes
- README, THEORY, and TECHNICAL docs are synchronized

---

# 153. Final Data Architecture

The most important data flow is:

```text
USER INPUT
   │
   ▼
React event log
   │
   ├── Rules
   ├── Known cards
   ├── Unknown cards
   ├── Seats
   └── Shoe events
   │
   ▼
Serialized API request
   │
   ▼
Pydantic schemas
   │
   ▼
Canonical Python domain state
   │
   ▼
State validation
   │
   ▼
┌───────────────────────────────────┐
│             Engines               │
├───────────────────────────────────┤
│ Shoe                              │
│ Hand                              │
│ Rules                             │
│ Dealer                            │
│ Hidden Information                │
└─────────────────┬─────────────────┘
                  │
                  ▼
┌───────────────────────────────────┐
│      Probability / Research       │
├───────────────────────────────────┤
│ Exact recursion                   │
│ Memoization                       │
│ Monte Carlo                       │
│ Confidence intervals              │
│ Research score comparison         │
└─────────────────┬─────────────────┘
                  │
                  ▼
          API response JSON
                  │
                  ▼
             React state
                  │
                  ▼
     Tables / charts / percentages
```

---

# 154. Final Source-of-Truth Rules

Use these rules throughout implementation:

### Table State

Source of truth:

```text
rules + events
```

### Remaining Cards

Source of truth:

```text
reconstructed Python shoe
```

### Hand Value

Source of truth:

```text
Python hand evaluator
```

### Legal Rule Transition

Source of truth:

```text
Python rules engine
```

### Exact Probability

Source of truth:

```text
Python exact probability engine
```

### Monte Carlo Estimate

Source of truth:

```text
Python simulation engine
```

### Confidence Interval

Source of truth:

```text
Python confidence module
```

### Research Count

Source of truth:

```text
configured research definition + Python count engine
```

### UI Percentage

Derived display only.

---

# 155. Final Recommendation

The implementation should remain deliberately modular.

The frontend should be a **thin interactive client**.

Python should contain the actual game-analysis intelligence.

The most important architectural boundary is:

```text
React = interaction and visualization
Python = validation, blackjack logic, probability, simulation, statistics
```

The application should not introduce a database, authentication layer, external casino API, task queue, or complicated cloud infrastructure unless the project requirements later genuinely need them.

For the current course scope, the best technical design is:

```text
React + TypeScript + Vite
          ↓
       REST/JSON
          ↓
FastAPI + Pydantic
          ↓
Pure Python domain / engine modules
          ↓
Exact probability + Monte Carlo + research analysis
```

This keeps the project simple enough to complete and demonstrate while still giving the Python backend enough structure for mathematically rigorous game analysis.
