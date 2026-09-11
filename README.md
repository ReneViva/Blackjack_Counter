# Blackjack Casino Simulation & Probability Analysis

## Overview

This project is an **educational blackjack simulation and statistical analysis website** designed for a Game Analysis course.

The goal is to simulate casino-style blackjack as faithfully as possible while providing a Python-based probability engine for studying:

- finite-deck probabilities
- cards sampled without replacement
- exact outcome calculations
- Monte Carlo simulation
- confidence intervals
- hidden and unknown information
- configurable blackjack rule variants
- comparison of simplified counting/scoring systems against exact card-composition analysis

The project is intended for **education, simulation, and statistical research only**. It does not connect to casinos, process wagers, recommend bet sizes, or handle real-money gambling.

---

## Main Idea

The application represents a blackjack table with a configurable shoe, dealer, player seats, and observable cards.

As cards are dealt, they are removed from the simulated shoe.

For example, in a single-deck game:

- Initial kings: `4`
- `K♥` is dealt
- Kings remaining: `3`
- Cards remaining: `51`

Therefore:

\[
P(\text{next card is a king}) = \frac{3}{51}
\]

The probability engine continuously updates the remaining-card composition and analyzes possible future outcomes.

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite

## Backend

- Python
- FastAPI
- Pydantic

## Statistics / Computation

- Python standard library
- NumPy if needed
- SciPy if needed

## Testing

- pytest

---

# Database

A database is **not required**.

The browser can hold the complete table state and send it to the Python backend whenever analysis is requested.

Optional browser `localStorage` may be used to preserve:

- rule settings
- current simulated shoe
- research settings
- replay data

No user accounts or authentication are required.

---

# Core Website Sections

The website should contain five primary sections.

## 1. Setup

Used to configure the blackjack table before starting a shoe.

## 2. Table

Interactive casino-style blackjack table where cards are entered or generated.

## 3. Analysis

Shows exact probability calculations and Monte Carlo results.

## 4. Research

Used to compare simplified counting/scoring models with the exact composition model.

## 5. Methodology

Explains the mathematics, assumptions, confidence intervals, limitations, and research design.

---

# Blackjack Rule Configuration

Casino blackjack does not use one universal ruleset.

The simulator should therefore support configurable rule profiles.

## Shoe Configuration

### Number of Decks

Supported options:

```text
1
2
3
4
5
6
7
8
? Unknown
```

For example:

### Six decks

\[
6 \times 52 = 312 \text{ cards}
\]

Each exact card appears six times.

Example:

```text
A♠ × 6
A♥ × 6
A♦ × 6
A♣ × 6
...
K♠ × 6
K♥ × 6
K♦ × 6
K♣ × 6
```

---

# Unknown Deck Count

If the number of decks is unknown, the software must **not silently assume a deck count**.

Instead, it should calculate results separately for every supported possibility.

Example:

```text
Deck Count Unknown

1 deck: result under N = 1
2 decks: result under N = 2
3 decks: result under N = 3
...
8 decks: result under N = 8
```

The interface may also display the sensitivity range across these assumptions.

An average should only be calculated if an explicit probability distribution over the possible deck counts has been defined.

---

# Player Positions

The application should support configurable player seats.

Suggested maximum:

```text
7 player positions
+ dealer
```

A user should be able to define:

```text
Seat 1
Seat 2
Seat 3
YOU
Seat 5
Seat 6
Seat 7
Dealer
```

Empty seats must also be allowed.

---

# Rule Options

The Rules Setup screen should support:

| Rule | Options |
|---|---|
| Number of decks | 1–8 / Unknown |
| Number of players | Configurable |
| Your seat | Selectable |
| Dealer soft 17 | Hit / Stand |
| Dealer second card | Hole card / configured rule profile |
| Dealer blackjack check | Configurable |
| Doubling | Enabled / Disabled |
| Double after split | Yes / No |
| Splitting | Yes / No |
| Maximum split hands | Configurable |
| Split aces | Configurable |
| Additional cards after split aces | Configurable |
| Natural blackjack after split | Rule dependent |
| Surrender | None / configured variant |
| Shuffle | New shoe / configured model |

---

# Card Representation

The interface should display all available ranks and suits.

Example:

```text
♠  A 2 3 4 5 6 7 8 9 10 J Q K
♥  A 2 3 4 5 6 7 8 9 10 J Q K
♦  A 2 3 4 5 6 7 8 9 10 J Q K
♣  A 2 3 4 5 6 7 8 9 10 J Q K
```

For multi-deck shoes, each card should display the number of copies remaining.

Example:

```text
A♠ [6]
A♥ [5]
A♦ [6]
A♣ [6]

K♠ [4]
K♥ [6]
K♦ [5]
K♣ [6]
```

---

# Unknown Card Support

The card selector must also contain:

```text
[ ? Unknown Card ]
```

An unknown card means:

> A physical card exists or has been removed, but its identity is unknown.

This must be treated differently from a known card.

---

# Types of Unknown Information

The simulator should explicitly distinguish several types of uncertainty.

| Type | Example | Treatment |
|---|---|---|
| Known card | `K♥` | Remove exact card |
| Unknown physical card | Dealer has `?` face down | Marginalize over possible identities |
| Unknown removed cards | Tracking begins after cards were already dealt | Hidden composition |
| Unknown deck count | Shoe size is unknown | Sensitivity analysis |
| Unknown rule | H17 vs S17 unknown | Calculate separately |

---

# Hidden Cards

A hidden card must not simply reduce the number of remaining cards while leaving every rank unchanged.

Instead, the probability engine must treat its identity as a latent variable.

Conceptually:

\[
P(\text{result}) =
\sum_c
P(\text{hidden card}=c)
\times
P(\text{result}\mid c)
\]

The application therefore averages over all possible hidden-card identities using their correct remaining probabilities.

---

# Table Interface

Suggested layout:

```text
                 DEALER
              ┌─────────┐
              │ K♥  ?   │
              └─────────┘

 PLAYER 3       PLAYER 2       PLAYER 1
 10♣ 4♠          7♥ 7♣          Q♦ 3♣


                ★ YOU ★
                 A♣ 6♦


────────────────────────────────────────────
Shoe: 6 decks
Cards remaining: 296
Known cards: 15
Hidden cards: 1
────────────────────────────────────────────
```

Each seat should support:

```text
Add known card
Add unknown card
Undo
Remove/correct card
```

---

# Event-Based Game State

The simulator should internally store table activity as chronological events.

Example:

```text
1. New shoe
2. Dealer ← K♥
3. Player 1 ← Q♦
4. You ← A♣
5. Player 2 ← 7♥
6. Dealer ← ?
7. Player 1 ← 3♣
8. You ← 6♦
```

This makes it easier to support:

- Undo
- Replay
- Debugging
- Reproducibility
- Validation
- Research experiments

---

# Hand Evaluation

The Python engine must identify:

```text
Hard hand
Soft hand
Blackjack
21 that is not blackjack
Bust
Pair
Split hand
Split ace
Completed hand
```

---

# Ace Handling

Aces must dynamically count as either `1` or `11`.

Example:

```text
A + 6
```

is:

```text
Soft 17
```

If a `9` is added:

\[
11 + 6 + 9 = 26
\]

The ace must change from `11` to `1`:

\[
1 + 6 + 9 = 16
\]

Result:

```text
Hard 16
```

---

# Game State Machine

The game should follow a defined state machine.

```text
SETUP
   ↓
NEW_SHOE
   ↓
INITIAL_DEAL
   ↓
PLAYER_PHASE
   ↓
DEALER_PHASE
   ↓
ROUND_RESOLUTION
   ↓
DISCARD
   ↓
NEXT_ROUND
```

The state machine should prevent impossible actions.

Examples:

```text
Hit after busting
Split a non-pair
Add impossible duplicate cards
Deal after the round has ended
Continue dealer play after a required stand
```

---

# Shoe Persistence

Cards remain removed across rounds until the shoe is reset or shuffled.

The engine should therefore distinguish:

```text
Cards in shoe
Cards currently in hands
Discarded cards
Hidden cards
```

Starting a new round must **not** automatically restore all cards.

Only a new shoe or shuffle reset should restore the complete card composition.

---

# Probability Engine

The primary probability engine should use the exact remaining composition of the shoe.

For one possible future card:

\[
P(c \mid S) = \frac{n_c}{N}
\]

Where:

- \(n_c\) = number of relevant copies remaining
- \(N\) = total cards remaining
- \(S\) = current game state

For multiple future states:

\[
P(O \mid S)
=
\sum_c
P(c \mid S)
P(O \mid S_c)
\]

Where:

- \(O\) = outcome
- \(S_c\) = state after card \(c\) is drawn

---

# Memoization

Many recursive branches eventually reach equivalent states.

Python should cache previously calculated states.

Example:

```python
from functools import lru_cache

@lru_cache
def evaluate_state(state):
    ...
```

This can significantly reduce repeated computation.

---

# Calculation Modes

The website should support three modes.

```text
● Exact
○ Monte Carlo
○ Compare Both
```

---

# Exact Calculation

The exact engine recursively analyzes every valid future branch.

Example output:

```text
Exact Calculation

Outcome probabilities:
Win:  ...
Push: ...
Loss: ...

Sampling uncertainty:
Not applicable
```

Exact calculations do not require a confidence interval because no Monte Carlo sampling error is present.

---

# Monte Carlo Simulation

Monte Carlo mode estimates probabilities through repeated random simulations.

Suggested options:

```text
Runs

[ 10,000 ]
[ 50,000 ]
[ 100,000 ]
[ Custom ]
```

The simulator should also support a random seed.

Example:

```text
Random Seed
[ 12345 ]
```

Using a seed makes experiments reproducible.

Example Python concept:

```python
import random

rng = random.Random(seed)
rng.shuffle(shoe)
```

---

# Confidence Levels

Monte Carlo results should support configurable confidence levels.

```text
[ 90% ]
[ 95% ]
[ 99% ]
```

Suggested default:

```text
95%
```

Example:

```text
MONTE CARLO ANALYSIS

Simulations:      100,000
Confidence:           95%
Seed:               12345

Estimated probability:
43.82%

95% Confidence Interval:
43.51% – 44.13%
```

Wilson confidence intervals are recommended for estimated proportions.

---

# Types of Uncertainty

The website should clearly distinguish three concepts.

## 1. Outcome Probability

Randomness in the future cards.

## 2. Monte Carlo Sampling Uncertainty

Uncertainty caused by estimating a probability using a finite number of simulation runs.

## 3. Model Uncertainty

Uncertainty caused by missing or unknown information such as:

- unknown deck count
- hidden cards
- unknown previously removed cards
- uncertain rule configuration

These must not be displayed as if they were the same thing.

---

# Research / Counting-System Comparison

The project may include a research module comparing simplified counting or scoring systems with the exact card-composition model.

The exact composition engine remains the reference model.

The research section may contain:

```text
Exact Composition Model
Scoring Model A
Scoring Model B
Scoring Model C
Ace-Side Statistic
Compare All
```

The specific scoring definitions should come from instructor-approved course material.

The application should not combine the results into one arbitrary "super probability."

Instead, it should compare how strongly each compressed score tracks the exact model.

---

# Research Question

A possible project research question is:

> How much information is lost when the exact finite-deck blackjack state is compressed into a simplified counting score?

---

# Batch Experiment Mode

The project should support:

```text
MODE

● Interactive Simulation
○ Batch Experiment
○ Replay
```

## Interactive Simulation

Play or enter simulated blackjack rounds manually.

## Batch Experiment

Generate thousands or millions of simulated states and compare models statistically.

## Replay

Step through a previously saved educational scenario event by event.

---

# Research Dataset

Example:

| State | Exact Result | Model A | Model B | Model C | Aces Remaining |
|---|---:|---:|---:|---:|---:|
| 1 | ... | ... | ... | ... | ... |
| 2 | ... | ... | ... | ... | ... |
| 3 | ... | ... | ... | ... | ... |

Python may then calculate:

- correlation
- model error
- RMSE
- MAE
- convergence
- confidence intervals
- sensitivity

---

# Validation

The application must reject impossible states.

Examples:

```text
❌ Seven K♥ cards entered into a six-deck shoe

❌ Player attempts an action after busting

❌ Split attempted on an invalid pair

❌ Cards entered after the round is complete

❌ Unknown cards exceed cards physically remaining
```

Example error:

```text
Impossible state:

K♥ appears 7 times,
but this shoe contains only 6 copies.
```

---

# Undo

An **Undo Last Event** button should always be available.

This is important because one incorrect card entry changes the entire remaining shoe and every following probability calculation.

---

# Privacy

The project should collect as little information as possible.

Recommended privacy design:

```text
No account
No login
No personal names
No location collection
No payment information
No casino connection
No real-money transactions
No advertising
No tracking analytics
No server-side user history
```

The website is intended for academic simulation only.

---

# Suggested Frontend Structure

```text
frontend/
│
├── src/
│   ├── components/
│   │   ├── BlackjackTable.tsx
│   │   ├── DealerSeat.tsx
│   │   ├── PlayerSeat.tsx
│   │   ├── CardPicker.tsx
│   │   ├── ShoeStatus.tsx
│   │   ├── RuleSetup.tsx
│   │   ├── AnalysisPanel.tsx
│   │   └── ResearchPanel.tsx
│   │
│   ├── pages/
│   │   ├── SetupPage.tsx
│   │   ├── TablePage.tsx
│   │   ├── AnalysisPage.tsx
│   │   ├── ResearchPage.tsx
│   │   └── MethodologyPage.tsx
│   │
│   ├── types/
│   │   └── game.ts
│   │
│   ├── App.tsx
│   └── main.tsx
│
└── package.json
```

---

# Suggested Python Backend Structure

```text
backend/
│
└── app/
    ├── main.py
    │
    ├── models/
    │   ├── card.py
    │   ├── hand.py
    │   ├── rules.py
    │   └── game_state.py
    │
    ├── engine/
    │   ├── shoe.py
    │   ├── hand_value.py
    │   ├── rules_engine.py
    │   ├── state_machine.py
    │   ├── dealer.py
    │   └── validation.py
    │
    ├── probability/
    │   ├── exact.py
    │   ├── monte_carlo.py
    │   ├── hidden_cards.py
    │   └── confidence.py
    │
    └── research/
        ├── scoring_models.py
        └── comparison.py
```

---

# Architecture

```text
┌───────────────────────────┐
│       React Website       │
│       TypeScript/Vite     │
└─────────────┬─────────────┘
              │
              │ JSON / HTTP
              ▼
┌───────────────────────────┐
│          FastAPI          │
│           Python          │
├───────────────────────────┤
│ Rule Engine               │
│ Shoe Engine               │
│ Hand Evaluator            │
│ State Validator           │
│ Exact Probability Engine  │
│ Monte Carlo Engine        │
│ Confidence Intervals      │
│ Research Comparison       │
└───────────────────────────┘
```

---

# API

The initial API can remain very small.

```text
POST /api/validate
POST /api/analyze
POST /api/simulate
POST /api/research/compare
```

Example request:

```json
{
  "rules": {
    "decks": 6,
    "dealer_soft_17": "stand"
  },

  "dealer": [
    {
      "rank": "K",
      "suit": "hearts"
    },
    {
      "unknown": true
    }
  ],

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
  ]
}
```

The frontend sends the current state.

The backend does not need to maintain a permanent user session.

---

# Suggested Tests

## Deck Tests

- 1 deck creates 52 cards
- 6 decks create 312 cards
- 8 decks create 416 cards
- each exact card appears the correct number of times
- new shoe restores the full composition

## Card Removal Tests

- known exposed card reduces the correct count
- hidden card creates uncertainty correctly
- discarded cards remain unavailable

## Hand Tests

- hard totals
- soft totals
- ace conversion
- blackjack
- ordinary 21
- bust
- pairs
- split hands

## Dealer Tests

- dealer stands correctly under S17
- dealer hits correctly under H17
- dealer stops after bust
- dealer hidden-card logic works correctly

## Rule Tests

- split restrictions
- split aces
- doubling restrictions
- surrender variants

## Probability Tests

- probabilities sum to 1
- exact calculations are deterministic
- Monte Carlo converges toward exact results
- confidence intervals stay between 0 and 1
- unknown information is treated as uncertainty rather than fake certainty

## Validation Tests

- impossible duplicates rejected
- invalid game actions rejected
- invalid state transitions rejected

---

# Recommended Implementation Order

## Phase 1 — Foundation

- React frontend
- FastAPI backend
- card models
- rule models
- shoe generation

## Phase 2 — Table

- configurable player seats
- dealer
- card picker
- unknown cards
- event log
- undo

## Phase 3 — Blackjack Rules

- hand evaluator
- dealer behavior
- splits
- doubling
- surrender
- rule validation

## Phase 4 — Exact Probability Engine

- remaining-card composition
- recursive analysis
- memoization
- hidden-card marginalization

## Phase 5 — Monte Carlo

- repeated simulation
- random seed
- 90%, 95%, and 99% confidence levels
- Wilson confidence intervals

## Phase 6 — Research

- batch experiments
- scoring-model comparison
- exact-vs-approximate analysis
- correlation and error metrics

## Phase 7 — Methodology & Testing

- methodology page
- assumptions
- limitations
- automated tests
- project presentation material

---

# Important Statistical Concepts

This project demonstrates several major statistical and computational ideas.

## Sampling Without Replacement

Cards are physically removed from a finite shoe.

## Conditional Probability

Future probabilities depend on the current observed state.

## Hidden Variables

Unknown cards have uncertain identities.

## Marginalization

Hidden-card probabilities are integrated over all possible identities.

## Dynamic Programming

Repeated game states can be cached rather than recalculated.

## Monte Carlo Simulation

Probabilities may be estimated through repeated simulated futures.

## Confidence Intervals

Sampling uncertainty around Monte Carlo estimates can be quantified.

## Sensitivity Analysis

Unknown deck count or rules may be evaluated under multiple assumptions.

---

# Educational Scope

This application is intended to demonstrate:

- probability theory
- finite populations
- simulation
- statistical uncertainty
- recursive algorithms
- imperfect information
- game-state modeling
- Monte Carlo methods
- confidence intervals
- software architecture

It should remain an **educational simulator and research project**, not a system for live wagering or casino automation.

---

# References

The project design is informed by:

- Penn State STAT 414 material on hypergeometric probability and sampling without replacement
- NIST statistical guidance on binomial-proportion confidence intervals
- blackjack rules published by gaming regulators
- gaming-equipment and blackjack-table regulations
- regulatory technical standards for random simulation systems

Useful references:

- Penn State STAT 414 — Hypergeometric Distribution  
  https://online.stat.psu.edu/stat414/Lesson07

- NIST Engineering Statistics Handbook — Confidence Intervals for a Proportion  
  https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm

- Nevada Gaming Control Board — Blackjack Rules of Play  
  https://www.gaming.nv.gov/

- Massachusetts Gaming Commission — Gaming Equipment Regulations  
  https://www.mass.gov/orgs/massachusetts-gaming-commission

- UK Gambling Commission — Random Outcome Technical Standards  
  https://www.gamblingcommission.gov.uk/

---

# Project Goal

The final project should demonstrate that blackjack can be modeled as a **finite-state, imperfect-information probability system**.

The central pipeline is:

```text
Observed Table State
        +
Remaining Shoe Composition
        +
Unknown Information
        +
Configured Blackjack Rules
        ↓
Python Probability Engine
        ↓
Exact / Monte Carlo Analysis
        ↓
Statistical Results
        ↓
Research Comparison
```

The result should be a simple, understandable website with a strong Python statistical core suitable for demonstration and analysis in a Game Analysis course.
