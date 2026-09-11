# Blackjack Probability & Counting Theory

## Purpose

This document defines the **theoretical and mathematical foundations** of the Blackjack Casino Simulation & Probability Analysis project.

The project models blackjack as a **finite-deck, imperfect-information stochastic process**. Its main objective is to compare:

1. **Exact remaining-card composition**
2. **Exact recursive probability**
3. **Monte Carlo simulation**
4. **Simplified card-counting / scoring systems**
5. **Hidden-information models**
6. **Statistical confidence and model uncertainty**

The software is intended for **educational simulation, statistical research, and game-analysis coursework**. The named counting systems are treated as research variables and compressed statistical descriptions of a simulated shoe. The project does not need to implement wagering recommendations.

---

# 1. Core Mathematical View

A blackjack shoe is a finite collection of cards.

Once a card is dealt, that particular card is no longer available until the shoe is reshuffled or reset.

Therefore blackjack is naturally modeled as:

> **Sequential sampling without replacement from a finite population.**

This is fundamentally different from repeatedly sampling from a fresh deck.

If a one-deck shoe contains four kings and one king has already been observed, then:

\[
P(\text{King next}) = \frac{3}{51}
\]

not:

\[
\frac{4}{52}
\]

The probabilities change after every known card.

---

# 2. State of the Shoe

Let the shoe contain \(d\) decks.

The initial number of cards is:

\[
N_0 = 52d
\]

For example:

| Decks | Cards |
|---:|---:|
| 1 | 52 |
| 2 | 104 |
| 4 | 208 |
| 6 | 312 |
| 8 | 416 |

The exact state can be represented by a **composition vector**.

At rank level:

\[
C =
(c_A,c_2,c_3,\ldots,c_{10},c_J,c_Q,c_K)
\]

where \(c_r\) is the number of cards of rank \(r\) currently available.

For a fresh \(d\)-deck shoe:

\[
c_A=c_2=\cdots=c_K=4d
\]

The total number of available cards is:

\[
N=\sum_r c_r
\]

If suits must also be distinguished, use a 52-dimensional exact-card vector instead.

For example:

\[
C =
(c_{A\spadesuit},c_{A\heartsuit},\ldots,c_{K\clubsuit})
\]

This exact representation is the most informative state available to the probability engine.

---

# 3. Known-Card Removal

Suppose card \(x\) is observed.

The state transition is:

\[
c_x' = c_x - 1
\]

and:

\[
N' = N-1
\]

All other counts remain unchanged.

The probability of observing card type \(x\) next is:

\[
P(X=x\mid C)=\frac{c_x}{N}
\]

This equation is the basic building block of the entire probability engine.

---

# 4. Probability of a Rank

If the engine only needs the probability of a rank, all suits of that rank are combined.

Suppose a six-deck shoe currently contains:

\[
c_K = 21
\]

kings among:

\[
N=280
\]

remaining cards.

Then:

\[
P(K)=\frac{21}{280}=0.075
\]

or:

\[
7.5\%
\]

---

# 5. Multiple Draws Without Replacement

When several future cards are considered, draws are dependent.

If the first future card is \(x\), then the probability of a second \(x\) becomes:

\[
P(X_2=x\mid X_1=x)
=
\frac{c_x-1}{N-1}
\]

For two different card categories \(x\) and \(y\):

\[
P(X_1=x,X_2=y)
=
\frac{c_x}{N}
\frac{c_y}{N-1}
\]

assuming \(x\neq y\).

The order matters when modeling a sequence.

---

# 6. Hypergeometric Distribution

If order does not matter and we only care about how many cards of a category appear in a sample, the **hypergeometric distribution** is appropriate.

If:

- \(N\) = total cards remaining
- \(K\) = cards of the target category
- \(n\) = number of cards drawn
- \(k\) = target cards observed

then:

\[
P(X=k)
=
\frac{
\binom{K}{k}
\binom{N-K}{n-k}
}{
\binom{N}{n}
}
\]

This is useful for questions involving the number of particular ranks or categories that may appear in a future group of cards.

---

# 7. Why Exact Composition Is the Reference Model

Traditional counting systems compress the shoe into one or a few numbers.

The exact composition model retains substantially more information.

For example, two different shoes could have the same simplified count while containing different numbers of:

- aces
- fives
- tens
- individual ranks
- exact suits

Therefore:

> A count is a compressed projection of the true state, while the composition vector is the full observable state.

Mathematically, if the exact state is \(C\), a counting system creates a score:

\[
R=f(C)
\]

Many different composition vectors may map to the same value of \(R\).

Therefore \(R\) generally contains less information than \(C\).

---

# 8. Exact Card-Composition Model

The primary model used in this project is the **exact composition model**.

For every known observed card:

1. Remove the exact card from the shoe.
2. Update the remaining composition.
3. Recalculate all future transition probabilities.
4. Continue recursively until a terminal game state is reached.

This becomes the reference against which approximate scoring systems can be evaluated.

---

# 9. Blackjack Hand Value

Card values are:

\[
2,\ldots,9 \rightarrow \text{face value}
\]

\[
10,J,Q,K \rightarrow 10
\]

An ace can represent:

\[
1 \text{ or } 11
\]

The hand-value function should first count aces as 11 and repeatedly convert an ace from 11 to 1 while the total exceeds 21.

---

# 10. Soft and Hard Hands

A **soft hand** is a hand in which at least one ace is currently counted as 11 without causing a bust.

Example:

\[
A+6=17
\]

This is soft 17.

If a 9 is added:

\[
11+6+9=26
\]

The ace must change to 1:

\[
1+6+9=16
\]

The hand is now hard 16.

The probability engine must retain whether a total is soft or hard because dealer rules can depend on this property.

---

# 11. Natural Blackjack

A natural blackjack should be represented separately from an ordinary total of 21.

Conceptually:

\[
\text{Natural Blackjack}
=
\text{two-card hand totaling 21}
\]

A three-card 21 is not the same state.

Similarly, depending on the configured rules, a two-card 21 created after splitting may not be treated identically to an original natural blackjack.

This distinction belongs in the rules engine.

---

# 12. Dealer State Model

The dealer follows deterministic rules once the cards are known.

A dealer state can be represented by:

\[
D=(H,C,R)
\]

where:

- \(H\) = dealer hand
- \(C\) = remaining shoe composition
- \(R\) = configured rules

The dealer outcome distribution can be calculated recursively.

Let:

\[
F(H,C)
\]

represent the distribution of final dealer outcomes.

If the dealer must stand:

\[
F(H,C)=\text{terminal distribution}
\]

If the dealer must draw:

\[
F(H,C)
=
\sum_x
P(x\mid C)
F(H+x,C-x)
\]

This recursion continues until every branch reaches a terminal dealer state.

Possible terminal categories include:

```text
17
18
19
20
21
Blackjack
Bust
```

depending on the exact rule representation.

---

# 13. Recursive Game Probability

More generally, define a state:

\[
S=(C,H_p,H_d,R,U)
\]

where:

- \(C\) = known remaining card composition
- \(H_p\) = player hand state
- \(H_d\) = dealer hand state
- \(R\) = blackjack rule profile
- \(U\) = hidden-information state

For a future outcome \(O\):

\[
P(O\mid S)
=
\sum_x
P(x\mid S)
P(O\mid S_x)
\]

where \(S_x\) is the state after possible card \(x\) occurs.

This equation is the core exact-recursion formula.

---

# 14. Terminal States

Recursive evaluation stops when the simulated game reaches a terminal state.

Examples include:

- player bust
- dealer bust
- completed dealer hand
- blackjack
- completed split hand
- completed round

At a terminal state, the outcome is known.

For a simplified win/push/loss representation:

\[
P_W + P_P + P_L = 1
\]

where:

- \(P_W\) = win probability
- \(P_P\) = push probability
- \(P_L\) = loss probability

This identity should always be tested numerically.

---

# 15. Dynamic Programming and Memoization

A naive recursive solution repeatedly evaluates the same state.

Suppose two different card orders eventually create the same:

- remaining composition
- player total
- dealer state
- rule state

The future probability from that point is identical.

Therefore we cache:

\[
V(S)
\]

after computing it once.

When the same state appears again, the cached result is reused.

In Python this can be implemented conceptually with:

```python
from functools import lru_cache

@lru_cache
def evaluate_state(state):
    ...
```

The state must be converted into an immutable canonical representation suitable for hashing.

This is a **dynamic programming** approach.

---

# 16. State Compression

For computational efficiency, exact suits do not always need to remain separate after validation.

If suit has no influence on the configured blackjack rules, the probability engine may internally compress cards into rank counts.

Instead of storing 52 exact card categories, it can use:

```text
A
2
3
4
5
6
7
8
9
10
J
Q
K
```

or even combine ten-value cards if the part of the model being computed does not need to distinguish them.

However, the user interface may still track exact cards so that duplicate-entry validation remains correct.

---

# 17. Hidden Information

Realistic blackjack simulation contains information that exists physically but may not be observed.

Examples:

- dealer hole card
- an unknown card marked `?`
- cards dealt before observation began
- unknown shoe size
- unknown rule configuration

Unknown information should never be silently replaced by arbitrary known values.

Instead, it must be modeled as uncertainty.

---

# 18. Unknown Card as a Latent Variable

Suppose one hidden card exists but its identity is unknown.

Let \(H\) represent the hidden card.

Then:

\[
P(O)
=
\sum_h
P(H=h)
P(O\mid H=h)
\]

This operation is called **marginalization**.

The probability of each possible hidden identity is determined from the known remaining composition.

If:

\[
P(H=h)=\frac{c_h}{N}
\]

then each possible hidden-card branch receives the appropriate weight.

---

# 19. Important Property of a Completely Unknown Removed Card

Suppose one card is randomly removed from a fresh deck but its identity is never observed.

The probability that the next observable card is a king is still:

\[
\frac{4}{52}
\]

not:

\[
\frac{4}{51}
\]

Why?

Because the hidden removed card might itself have been a king.

Using total probability:

\[
P(K_{\text{next}})
=
P(H=K)P(K_{\text{next}}\mid H=K)
+
P(H\neq K)P(K_{\text{next}}\mid H\neq K)
\]

The uncertainty about the hidden card exactly compensates for the physical removal in the one-step marginal probability.

However, the hidden card still matters for:

- multi-card joint probabilities
- later conditional probabilities
- situations where additional information is revealed
- rule-dependent events

Therefore the hidden state must still be modeled internally.

---

# 20. Conditional Information From Game Events

Game events can reveal information even when a card itself is hidden.

In probability language, the engine must condition on all observed evidence.

Let \(E\) denote observed evidence.

Then the hidden-card distribution becomes:

\[
P(H=h\mid E)
=
\frac{
P(E\mid H=h)P(H=h)
}{
P(E)
}
\]

This is Bayes' theorem.

A realistic simulator should therefore distinguish:

> No information about a hidden card

from:

> Information about a hidden card implied by another observed event.

This is one of the reasons the game rules and probability model must be connected.

---

# 21. Unknown Previous Cards

Suppose tracking begins after \(m\) cards have already been removed, but their identities are unknown.

The exact composition is no longer known.

Instead of one composition vector \(C\), the engine conceptually has a distribution:

\[
P(C\mid I)
\]

where \(I\) is the information available to the observer.

Outcome probability becomes:

\[
P(O\mid I)
=
\sum_C
P(O\mid C)
P(C\mid I)
\]

Enumerating all possible compositions may be computationally expensive.

The project can therefore support two approaches:

### Exact marginalization

Used when the hidden state space is small enough.

### Monte Carlo integration

Sample plausible hidden compositions and average the resulting outcome probabilities.

---

# 22. Unknown Number of Decks

Let:

\[
D \in \{1,2,\ldots,8\}
\]

represent the deck count.

If \(D\) is known, analysis is conditional on that value.

If \(D\) is unknown and no prior probabilities are supplied, the project should report a **sensitivity analysis**:

\[
P(O\mid D=1)
\]

\[
P(O\mid D=2)
\]

\[
\vdots
\]

\[
P(O\mid D=8)
\]

This avoids inventing an unsupported assumption.

---

# 23. Bayesian Mixture for Unknown Deck Count

If a probability distribution over deck counts is deliberately specified, then:

\[
P(O\mid I)
=
\sum_d
P(O\mid I,D=d)
P(D=d\mid I)
\]

For example, if the model assigns prior probabilities to possible shoe sizes, the final result is a weighted mixture.

However:

> A prior distribution is a modeling assumption and must be disclosed.

The default project behavior should therefore be sensitivity analysis rather than silent averaging.

---

# 24. Exact Probability vs Monte Carlo Probability

The project should support both.

## Exact Calculation

The exact engine enumerates every mathematically relevant future branch.

It produces:

\[
P(O\mid S)
\]

directly from the finite state space.

Advantages:

- deterministic
- no sampling noise
- reproducible
- useful as a reference model

Disadvantages:

- can become computationally expensive
- hidden information may create many branches
- splits can greatly increase the state space

---

# 25. Monte Carlo Simulation

Monte Carlo simulation repeatedly generates possible future continuations from the current state.

Suppose we run \(n\) simulations.

If the desired outcome occurs \(W\) times:

\[
\hat p = \frac{W}{n}
\]

As:

\[
n\rightarrow\infty
\]

the Monte Carlo estimate tends to the true underlying probability under the simulated model.

---

# 26. Monte Carlo Algorithm

Conceptually:

```text
Input:
    current shoe state
    visible cards
    hidden information model
    rules
    number of simulations n

For simulation = 1 ... n:

    1. Sample hidden information if necessary
    2. Copy the remaining shoe
    3. Shuffle/sample future cards
    4. Complete the simulated round
    5. Record the terminal outcome

Return:
    empirical outcome frequencies
```

The simulation must sample **without replacement** from the remaining shoe.

---

# 27. Reproducibility and Random Seeds

Monte Carlo experiments should support a random seed.

If:

```text
seed = 12345
```

the same implementation can reproduce the same pseudorandom simulation sequence.

This is valuable for:

- debugging
- research replication
- demonstrations
- tests

The seed does not make the simulation more accurate; it makes it reproducible.

---

# 28. Monte Carlo Standard Error

For a binary event with estimated probability:

\[
\hat p
\]

and \(n\) independent simulation runs, an approximate standard error is:

\[
SE(\hat p)
=
\sqrt{
\frac{
\hat p(1-\hat p)
}{
n
}
}
\]

As \(n\) increases, the standard error decreases approximately as:

\[
\frac{1}{\sqrt n}
\]

Therefore increasing simulations by a factor of four approximately halves the sampling error.

---

# 29. Confidence Levels

The website should allow:

```text
90%
95%
99%
```

confidence levels for Monte Carlo estimates.

A confidence interval describes uncertainty from the finite number of simulation runs.

It does **not** represent uncertainty from:

- unknown cards
- unknown deck count
- unknown rules

Those are model uncertainties and must be reported separately.

---

# 30. Wilson Confidence Interval

For a binomial proportion, the project should prefer the **Wilson interval** over the simplest normal approximation.

Let:

- \(\hat p\) = estimated probability
- \(n\) = number of simulations
- \(z\) = normal critical value for the selected confidence level

The Wilson center is:

\[
\text{center}
=
\frac{
\hat p+\frac{z^2}{2n}
}{
1+\frac{z^2}{n}
}
\]

The half-width is:

\[
\text{half}
=
\frac{
z
}{
1+\frac{z^2}{n}
}
\sqrt{
\frac{
\hat p(1-\hat p)
}{
n
}
+
\frac{
z^2
}{
4n^2
}
}
\]

The interval is:

\[
[\text{center}-\text{half},
 \text{center}+\text{half}]
\]

Typical critical values are approximately:

| Confidence | \(z\) |
|---:|---:|
| 90% | 1.645 |
| 95% | 1.960 |
| 99% | 2.576 |

---

# 31. No Confidence Interval for Exact Results

If exact recursion produces:

\[
P(O)=0.438271\ldots
\]

there is no Monte Carlo sampling error.

Therefore the interface should say:

```text
Exact calculation
Confidence interval: Not applicable
```

rather than attaching a confidence interval to the exact result.

---

# 32. Three Different Kinds of Uncertainty

The project should distinguish:

## Outcome Uncertainty

The future card sequence is random.

## Sampling Uncertainty

Monte Carlo uses only a finite number of simulated futures.

## Model / Information Uncertainty

The current state may contain unknown information.

Examples:

- deck count unknown
- hidden cards
- unknown removed cards
- rule configuration unknown

These are mathematically different concepts.

---

# 33. Card Counting as State Compression

A counting system assigns a numerical weight to card ranks.

Let:

\[
w(r)
\]

be the weight assigned by a particular system to rank \(r\).

After observing cards:

\[
r_1,r_2,\ldots,r_t
\]

the running score is:

\[
R_t
=
\sum_{i=1}^{t}
w(r_i)
\]

This is a one-dimensional summary of the observed shoe history.

Different systems use different weighting functions.

In this project, the weights should be stored as **configurable research definitions**, preferably from instructor-approved or properly cited source material.

---

# 34. Counting Systems Included as Research Models

The planned research layer may compare:

- Wong Halves
- Zen Count
- Omega II
- Ace Side Counting
- exact composition model

The named systems should be treated as **alternative compressed representations of the same simulated shoe**.

The theoretical comparison is:

\[
C
\longrightarrow
R_{\text{Wong}}
\]

\[
C
\longrightarrow
R_{\text{Zen}}
\]

\[
C
\longrightarrow
R_{\text{Omega}}
\]

while the full model keeps:

\[
C
\]

itself.

---

# 35. Wong Halves — Theoretical Role

Wong Halves is a **multi-level fractional counting system**.

For this project, its important theoretical characteristics are:

- cards receive different fractional or integer weights
- observed cards are accumulated into a running score
- the score summarizes changes in shoe composition
- the scoring function contains much less information than the exact composition vector

The project can calculate the score for simulated states and study how well that score correlates with exact model outputs.

Operational betting thresholds are outside the scope of the research implementation.

---

# 36. Zen Count — Theoretical Role

Zen Count is a **multi-level counting system**.

Conceptually:

\[
R_{\text{Zen}}
=
\sum_r
w_{\text{Zen}}(r)n_r^{\text{observed}}
\]

The research question is not simply whether the count is positive or negative.

Instead:

> How much variation in the exact composition-based probability can the Zen score explain?

This can be studied using statistical correlation and calibration methods.

---

# 37. Omega II — Theoretical Role

Omega II also represents the shoe with a weighted score.

The theoretical structure is:

\[
R_{\text{Omega}}
=
\sum_r
w_{\text{Omega}}(r)n_r^{\text{observed}}
\]

The exact mapping is a configurable research definition.

The main statistical question is whether its additional weighting complexity preserves more useful information than simpler compressed models.

---

# 38. Ace Side Count

An ace side count tracks ace information separately from the primary running score.

Represent this as:

\[
A_t = \text{number of observed aces}
\]

or equivalently:

\[
A_{\text{remaining}}
=
4d-A_t
\]

after also accounting for any known state transitions.

The research model may therefore use two variables:

\[
(R_t,A_t)
\]

rather than only:

\[
R_t
\]

This is theoretically important because it demonstrates that a one-dimensional count can be extended by adding another state feature.

---

# 39. Normalized Count

In multi-deck shoes, some counting models normalize a running score by an estimate of the remaining shoe size.

Abstractly:

\[
T_t
=
\frac{R_t}{D_t}
\]

where:

- \(R_t\) = running score
- \(D_t\) = estimated decks remaining

For this educational project, this normalized quantity can be treated as another research feature.

Because the simulator knows the exact number of cards remaining, it can calculate:

\[
D_t
=
\frac{N_t}{52}
\]

exactly inside the simulated environment.

The project does not need to provide live estimation instructions.

---

# 40. Why Different Counting Systems Can Disagree

Suppose two composition states are:

\[
C_1
\]

and:

\[
C_2
\]

A simplified scoring system may produce:

\[
f(C_1)=f(C_2)
\]

even though:

\[
P(O\mid C_1)\neq P(O\mid C_2)
\]

This happens because the score discards information.

Different systems define different functions:

\[
f_1(C),f_2(C),f_3(C)
\]

and therefore preserve different aspects of the underlying composition.

This is precisely what the research module should investigate.

---

# 41. Do Not Average Counting Systems Directly

Suppose three systems produce scores:

\[
R_1,\ R_2,\ R_3
\]

It is generally not meaningful to compute:

\[
\frac{R_1+R_2+R_3}{3}
\]

because:

- their scales differ
- their weights differ
- their interpretations differ
- their variances differ

Likewise, the systems do not directly produce independent probabilities that should simply be averaged.

Instead, compare each system separately with the exact model.

---

# 42. Counting Systems as Predictors

For offline research, a scoring system can be treated as a statistical predictor.

For simulated state \(i\):

\[
(R_i,p_i)
\]

where:

- \(R_i\) = score from a counting system
- \(p_i\) = exact composition-based probability produced by the reference model

A dataset of many simulated states can therefore be generated:

\[
\{(R_i,p_i)\}_{i=1}^{m}
\]

This enables statistical comparison.

---

# 43. Pearson Correlation

Pearson correlation measures linear association.

For score \(R\) and exact outcome probability \(P\):

\[
\rho_{R,P}
=
\frac{
\operatorname{Cov}(R,P)
}{
\sigma_R\sigma_P
}
\]

Interpretation:

```text
+1   strong positive linear association
 0   little linear association
-1   strong negative linear association
```

Correlation does not imply causation.

In this project it measures how strongly changes in a count score correspond to changes in the exact model output.

---

# 44. Spearman Correlation

If the relationship is monotonic but not linear, Spearman rank correlation can also be used.

Instead of comparing raw values, it compares ranks.

This answers:

> When the exact probability increases, does the counting score generally move in the same direction?

---

# 45. Regression Calibration

A score is not automatically a probability.

If the project wants to study whether a score can approximate the exact model, an **offline calibration model** can be fitted.

Conceptually:

\[
p_i \approx g(R_i)
\]

where \(g\) might be:

- linear regression
- logistic regression
- polynomial regression
- isotonic calibration

This must be evaluated on held-out simulated states rather than the same data used to fit the model.

The result is a research comparison, not an assumption that the count itself equals probability.

---

# 46. Train/Test Separation

If statistical models are fitted to map a count to an outcome probability, simulated data should be divided into:

```text
Training set
Validation set
Test set
```

The test set must not be used to fit model parameters.

This prevents the project from reporting artificially optimistic accuracy.

---

# 47. Mean Absolute Error

If:

\[
p_i
\]

is the exact reference probability and:

\[
\hat p_i
\]

is an approximation, the Mean Absolute Error is:

\[
MAE
=
\frac{1}{m}
\sum_{i=1}^m
|p_i-\hat p_i|
\]

Lower MAE indicates closer approximation.

---

# 48. Root Mean Squared Error

RMSE is:

\[
RMSE
=
\sqrt{
\frac{1}{m}
\sum_{i=1}^m
(p_i-\hat p_i)^2
}
\]

Because errors are squared, RMSE penalizes large errors more strongly than MAE.

---

# 49. Brier Score

For a binary simulated outcome with forecast probability \(p_i\) and realized outcome \(y_i\in\{0,1\}\):

\[
BS
=
\frac{1}{m}
\sum_{i=1}^m
(p_i-y_i)^2
\]

The Brier score evaluates probabilistic prediction quality.

It can be used in research experiments where a model's predicted probabilities are compared with simulated outcomes.

---

# 50. Calibration

A probability model is calibrated when events assigned probability \(p\) occur approximately proportion \(p\) of the time over repeated comparable experiments.

For example, among states assigned approximately:

\[
70\%
\]

probability, the corresponding event should occur about 70% of the time in a sufficiently large correctly generated sample.

Calibration plots can therefore be useful in the research section.

---

# 51. Exact Model Validation With Monte Carlo

One important experiment is:

1. Select a fixed shoe state.
2. Calculate the exact probability.
3. Run Monte Carlo with increasing sample sizes.
4. Compare the Monte Carlo estimate with the exact value.

For example:

```text
Exact             p*
1,000 runs        p̂1
10,000 runs       p̂2
100,000 runs      p̂3
1,000,000 runs    p̂4
```

The estimates should tend to stabilize around the exact probability.

This demonstrates Monte Carlo convergence empirically.

---

# 52. Law of Large Numbers

If \(X_1,\ldots,X_n\) are repeated simulation outcomes coded as 0 or 1, then:

\[
\hat p_n
=
\frac{1}{n}
\sum_{i=1}^n X_i
\]

converges toward the true model probability as \(n\) becomes large, under the assumptions of the simulation model.

This is the theoretical basis for Monte Carlo estimation.

---

# 53. Simulation Variance

For a Bernoulli outcome:

\[
Var(X)=p(1-p)
\]

and:

\[
Var(\hat p)
=
\frac{p(1-p)}{n}
\]

Therefore:

\[
SD(\hat p)
=
\sqrt{
\frac{p(1-p)}{n}
}
\]

This explains why larger simulation counts produce more stable estimates.

---

# 54. Rule Profiles as Mathematical Parameters

Casino blackjack varies by table rules.

Therefore rules belong in the state:

\[
R=
(
r_{\text{soft17}},
r_{\text{split}},
r_{\text{double}},
r_{\text{surrender}},
\ldots
)
\]

The probability is therefore more accurately written as:

\[
P(O\mid C,H,R,I)
\]

rather than simply:

\[
P(O)
\]

A different rule profile can produce a different probability even with the same cards.

---

# 55. Dealer Soft 17

One important rule parameter is whether the dealer:

```text
stands on soft 17
```

or:

```text
hits soft 17
```

The hand:

\[
A+6
\]

is therefore a state in which the dealer transition function depends on the selected rule profile.

This demonstrates why the rule engine cannot be separated from the probability engine.

---

# 56. Splitting and State Expansion

Splitting creates multiple player hands.

Instead of one player hand:

\[
H_p
\]

the state becomes:

\[
(H_{p1},H_{p2},\ldots)
\]

Each hand can produce additional cards and potentially further legal state transitions depending on the rules.

This dramatically increases the number of possible recursive states.

Memoization becomes especially important.

---

# 57. Shoe Penetration

Let:

\[
N_0
\]

be the original number of cards and:

\[
N_t
\]

the number remaining.

A simple shoe-progress measure is:

\[
q_t
=
1-\frac{N_t}{N_0}
\]

This represents the fraction of the shoe that has left the undealt portion.

In the project this is useful as:

- a simulation-state variable
- a research covariate
- a way to group experiments by early/middle/late shoe

It should not be interpreted as a wagering instruction.

---

# 58. Shuffle / New Shoe

Once a complete reshuffle is modeled, previous observed-card information no longer determines the new order.

For a new \(d\)-deck shoe:

\[
C \leftarrow C_0(d)
\]

and the running state from the previous shoe should be reset.

This includes any research counting score that depends on cards from the previous shoe.

---

# 59. Event Log as a Mathematical Object

Rather than storing only the current state, the application should store an event sequence:

\[
E=(e_1,e_2,\ldots,e_t)
\]

A deterministic reducer converts events into the current state:

\[
S_t
=
F(S_0,E)
\]

This makes:

- replay deterministic
- undo simple
- debugging easier
- experiments reproducible

It also allows researchers to compare the exact same sequence using multiple scoring systems.

---

# 60. State Validation

A mathematically valid state must satisfy physical constraints.

For each exact card \(x\):

\[
0\le c_x\le d
\]

For rank-level counts:

\[
0\le c_r\le4d
\]

The total must satisfy:

\[
0\le N\le52d
\]

All known cards in:

- player hands
- dealer hand
- discard pile
- other seats

must reconcile with the original shoe.

The probability engine should refuse inconsistent states.

---

# 61. Numerical Precision

Exact recursion often produces rational probabilities.

Internally, options include:

### Floating point

Fast and usually sufficient.

### Rational arithmetic

Potentially exact but more expensive.

### Log probabilities

Useful if extremely small path probabilities are multiplied across long sequences.

For this project, double-precision floating point is likely sufficient, provided tests verify:

\[
|P_W+P_P+P_L-1|<\epsilon
\]

for a small tolerance such as:

\[
\epsilon=10^{-10}
\]

or an implementation-appropriate threshold.

---

# 62. Computational Complexity

If every future card sequence is enumerated independently, the number of paths grows rapidly.

If there are:

\[
N
\]

remaining cards, naive enumeration can involve enormous branching.

The practical solution combines:

- rank-state compression
- memoization
- terminal-state pruning
- symmetry
- exact recursion where tractable
- Monte Carlo where exact enumeration becomes too expensive

---

# 63. Hybrid Exact / Monte Carlo Method

The project can support a hybrid strategy.

Example:

```text
Small state space:
    use exact recursion

Large state space:
    use Monte Carlo

Research mode:
    calculate both when feasible
```

A configurable computational threshold can determine when the engine changes methods.

The UI must clearly label which method produced the result.

---

# 64. Unknown-State Monte Carlo

Monte Carlo is particularly useful for hidden information.

Each simulation can:

1. Sample a possible hidden state.
2. Complete the future game from that state.
3. Record the outcome.

If the hidden-state sampling distribution is correct, the resulting simulation integrates over hidden uncertainty automatically.

This can approximate:

\[
P(O\mid I)
=
\sum_H
P(O\mid H,I)P(H\mid I)
\]

without explicitly enumerating every hidden state.

---

# 65. Sensitivity Analysis

When an assumption is unknown, results should be recomputed under several plausible values.

For example:

\[
D=1,\ldots,8
\]

or:

```text
Dealer stands on soft 17
Dealer hits soft 17
```

The output should report a range or side-by-side comparison.

This is preferable to hiding uncertainty behind an arbitrary default.

---

# 66. Research Experimental Design

A robust batch experiment should:

1. Generate many valid simulated shoe states.
2. Record exact composition.
3. Calculate the exact reference probability.
4. Calculate each scoring-system value.
5. Store shoe progress and other relevant covariates.
6. Split data into training/test sets if fitting models.
7. Compare performance using predefined metrics.
8. Repeat with multiple seeds if simulation is involved.

This creates a reproducible statistical study.

---

# 67. Stratified Analysis

The relationship between a count and exact probability may differ depending on shoe progress.

Therefore results can be grouped into:

```text
Early shoe
Middle shoe
Late shoe
```

or by quantitative ranges of:

\[
q_t
\]

This can reveal whether a scoring system behaves differently as fewer cards remain.

---

# 68. Comparing Models Fairly

All counting/scoring systems must be evaluated on the **same generated shoe states**.

Otherwise differences could be caused by different test samples rather than the systems themselves.

For every state \(C_i\), calculate:

\[
R_{i,1},R_{i,2},R_{i,3},\ldots
\]

and compare all of them to the same exact target:

\[
p_i
\]

This is a paired experimental design.

---

# 69. Research Output Table

An offline batch dataset may look like:

| State | Decks | Cards Remaining | Exact Probability | Wong Feature | Zen Feature | Omega Feature | Ace Feature |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 6 | 291 | ... | ... | ... | ... | ... |
| 2 | 6 | 244 | ... | ... | ... | ... | ... |
| 3 | 6 | 173 | ... | ... | ... | ... | ... |

The specific count values depend on the configured research definitions.

---

# 70. Suggested Research Hypotheses

Examples suitable for a course report:

### Hypothesis 1

The exact composition model contains more predictive information than any one-dimensional counting score.

### Hypothesis 2

Multi-level scoring systems may correlate more strongly with exact composition outputs than simpler compressed scores.

### Hypothesis 3

Adding an ace-side feature may improve approximation relative to the same primary count alone.

### Hypothesis 4

Monte Carlo estimates converge toward exact recursive probabilities as simulation count increases.

### Hypothesis 5

Model uncertainty caused by hidden cards can be larger than Monte Carlo sampling uncertainty when the number of simulations is sufficiently large.

---

# 71. What the Project Should NOT Confuse

The following are different:

### Running count

\[
R_t
\]

A compressed score based on observed ranks.

### Normalized count

\[
T_t
\]

A score adjusted by remaining shoe size.

### Exact probability

\[
P(O\mid C)
\]

Calculated from the full remaining composition.

### Monte Carlo estimate

\[
\hat P(O\mid C)
\]

An empirical approximation of the probability.

### Confidence interval

An interval describing simulation sampling uncertainty.

### Sensitivity range

Variation caused by uncertain assumptions.

These must appear as different concepts in the interface and report.

---

# 72. Theoretical Hierarchy of Models

The project can be viewed as a hierarchy:

```text
Physical simulated shoe
        ↓
Exact composition C
        ↓
Exact probability model P(O | C)
        ↓
Monte Carlo approximation P̂(O | C)
        ↓
Compressed count models f1(C), f2(C), f3(C)
        ↓
Statistical comparison with exact model
```

This hierarchy is central to the research design.

---

# 73. Why Python Is Appropriate

Python is well suited to this project because it supports:

- recursive algorithms
- immutable tuples for memoization
- random simulation
- numerical computation
- scientific libraries
- statistical analysis
- testing
- FastAPI integration

The probability engine can therefore remain separate from the React user interface.

---

# 74. Conceptual Python Data Structures

Exact-card state:

```python
remaining = {
    "AS": 6,
    "AH": 6,
    "AD": 6,
    "AC": 6,
    # ...
}
```

Rank-compressed state:

```python
rank_counts = {
    "A": 24,
    "2": 24,
    "3": 24,
    # ...
    "K": 24,
}
```

Unknown information:

```python
hidden_cards = 1
```

Rule state:

```python
rules = {
    "decks": 6,
    "dealer_soft_17": "stand",
}
```

---

# 75. Probability Engine Layers

A clean mathematical implementation should use the following layers:

```text
Physical State
    ↓
State Validation
    ↓
Known-Card Removal
    ↓
Hidden-State Model
    ↓
Hand Evaluation
    ↓
Rules Engine
    ↓
Exact Recursion
    ↓
Monte Carlo Approximation
    ↓
Confidence Analysis
    ↓
Research Comparison
```

Each layer should be independently testable.

---

# 76. Verification Invariants

Useful mathematical invariants include:

## Composition

\[
N
=
\sum_x c_x
\]

## Probability

\[
\sum_xP(X=x)=1
\]

## Final outcome distribution

\[
P_W+P_P+P_L=1
\]

## Card counts

\[
c_x\ge0
\]

## Confidence interval

\[
0\le L\le U\le1
\]

Automated tests should check these conditions.

---

# 77. Sources of Error

Potential errors include:

### Input Error

A user enters the wrong card.

Mitigation:

- undo
- correction
- duplicate validation

### Model Error

The configured rules differ from the intended simulated table.

Mitigation:

- explicit rule profile
- methodology page

### Sampling Error

Monte Carlo uses a finite sample.

Mitigation:

- confidence intervals
- larger simulation counts

### Hidden-State Error

Unknown information is incorrectly treated as known.

Mitigation:

- explicit latent-state modeling

### Numerical Error

Floating-point approximations accumulate.

Mitigation:

- probability-sum checks
- tolerance tests

---

# 78. Primary Research Comparison

The main theoretical comparison should be:

\[
\boxed{
\text{Exact composition}
\quad\text{vs}\quad
\text{compressed counting systems}
}
\]

The exact composition model answers:

> Given everything the simulator knows about the shoe, what does the full finite-deck model imply?

The counting models answer:

> How much of that information can be represented by a much smaller score?

This makes the project a study of both **probability** and **information compression**.

---

# 79. Proposed Final Mathematical Pipeline

```text
INITIAL SHOE
    │
    ▼
C₀ = full card composition
    │
    ▼
OBSERVED EVENTS
    │
    ├── Known cards
    ├── Unknown cards
    ├── Player/dealer events
    └── Rule information
    │
    ▼
CURRENT INFORMATION STATE
    │
    ├─────────────────────┐
    ▼                     ▼
Exact composition       Count features
model                   Wong / Zen /
                        Omega / Ace side
    │                     │
    ▼                     ▼
Exact recursion        Research scores
    │
    ├─────────────┐       │
    ▼             ▼       │
Exact P       Monte Carlo │
              estimate    │
    │             │       │
    └──────┬──────┘       │
           ▼              │
   Confidence analysis    │
           │              │
           └──────┬───────┘
                  ▼
          Statistical comparison
                  │
                  ▼
        Course research results
```

---

# 80. Final Theoretical Position

The project should not treat traditional card counting as the mathematical ground truth.

The theoretical hierarchy is:

### Ground-truth model within the simulation

Exact finite-shoe composition and configured game rules.

### Exact solution

Recursive conditional probability with memoization.

### Approximate numerical solution

Monte Carlo simulation.

### Compressed descriptive models

Wong Halves, Zen Count, Omega II, and ace-side features.

### Statistical evaluation

Correlation, calibration, MAE, RMSE, confidence intervals, and sensitivity analysis.

This design allows the project to answer a scientifically meaningful question:

> **How accurately can compact card-counting representations summarize the information contained in the exact remaining composition of a finite blackjack shoe?**

---

# References and Theory Sources

The following categories of sources should be cited in the final academic report:

1. **Finite-population probability and hypergeometric distribution**
   - Penn State STAT 414, Hypergeometric Distribution
   - https://online.stat.psu.edu/stat414/Lesson07

2. **Confidence intervals for binomial proportions**
   - NIST/SEMATECH e-Handbook of Statistical Methods
   - https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm

3. **Dynamic programming / finite-state recursion**
   - QuantEcon, Dynamic Programming
   - https://quantecon.github.io/book-dp1/

4. **Blackjack rule definitions**
   - Official gaming-regulator rules and approved game documentation should be used for the implemented rule profiles.

5. **Counting-system definitions**
   - Use instructor-approved and properly cited references for Wong Halves, Zen Count, Omega II, and ace-side counting.
   - The software should keep those definitions configurable so the research can be reproduced without hard-coding undocumented assumptions.

---

# Summary

The theoretical foundation of the project combines:

- finite-population probability
- sampling without replacement
- hypergeometric distributions
- conditional probability
- Bayes' theorem
- hidden variables
- marginalization
- recursive probability
- dynamic programming
- memoization
- Monte Carlo simulation
- the law of large numbers
- confidence intervals
- sensitivity analysis
- statistical calibration
- model-comparison metrics
- information compression through counting scores

The exact remaining-card composition is the project's central state representation.

Everything else—Monte Carlo estimates and counting-system scores—can then be measured against that reference model.
