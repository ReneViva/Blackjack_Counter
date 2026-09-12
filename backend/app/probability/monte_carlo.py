from dataclasses import dataclass
import math
import random

from app.domain import DealerCheckResult, Outcome, RoundPhase
from app.engine import (
    DealerStatus,
    advance_dealer,
    evaluate_dealer,
    resolve_outcomes,
    validate_table_state,
)

from .analysis import build_dealer_completion_round
from .distribution import OutcomeDistribution
from .exact import ExactAnalysisError, possible_draws
from .hidden_cards import sample_hidden_state


MAX_SIMULATIONS = 1_000_000


@dataclass(frozen=True, slots=True)
class OutcomeCounts:
    win: int = 0
    push: int = 0
    loss: int = 0

    @property
    def total(self) -> int:
        return self.win + self.push + self.loss

    def distribution(self) -> OutcomeDistribution:
        if self.total < 1:
            raise ValueError("outcome counts require at least one completed trial")
        return OutcomeDistribution(
            win=self.win / self.total,
            push=self.push / self.total,
            loss=self.loss / self.total,
        )


@dataclass(frozen=True, slots=True)
class MonteCarloEvaluation:
    counts: OutcomeCounts
    outcomes: OutcomeDistribution
    simulations: int
    seed: int | None
    cards_remaining: int
    known_cards: int
    hidden_cards: int


def _weighted_draw(state, rng: random.Random):
    draws = possible_draws(state.game_state.shoe)
    if not draws:
        raise ExactAnalysisError(
            "simulation_shoe_exhausted",
            "The dealer must draw, but the simulated shoe is empty.",
        )
    selection = rng.randrange(sum(draw.count for draw in draws))
    for draw in draws:
        if selection < draw.count:
            return draw.card
        selection -= draw.count
    raise AssertionError("weighted draw did not resolve")


def _simulate_round(state, rng: random.Random) -> Outcome:
    current = state
    while current.phase is not RoundPhase.ROUND_COMPLETE:
        dealer = evaluate_dealer(
            current.game_state.dealer_hand, current.game_state.rules
        )
        if dealer.status is DealerStatus.HIT_REQUIRED:
            current = advance_dealer(current, _weighted_draw(current, rng))
        else:
            current = advance_dealer(current)
    outcome = resolve_outcomes(current)[0]
    if outcome is None:
        raise ExactAnalysisError(
            "simulation_outcome_indeterminate",
            "A completed simulation produced an indeterminate outcome.",
        )
    return outcome


def simulate_table(
    state,
    simulations: int,
    *,
    seed: int | None = None,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
) -> MonteCarloEvaluation:
    if (
        isinstance(simulations, bool)
        or not isinstance(simulations, int)
        or not 1 <= simulations <= MAX_SIMULATIONS
    ):
        raise ExactAnalysisError(
            "invalid_simulation_count",
            f"Simulations must be an integer between 1 and {MAX_SIMULATIONS}.",
        )
    if isinstance(seed, bool) or (seed is not None and not isinstance(seed, int)):
        raise ExactAnalysisError("invalid_seed", "Seed must be an integer or null.")
    validation = validate_table_state(state)
    if not validation.valid:
        raise ExactAnalysisError("invalid_state", validation.errors[0].message)
    if state.game_state is None:
        raise ExactAnalysisError(
            "simulation_requires_concrete_model",
            "Monte Carlo simulation requires concrete deck and rule assumptions.",
        )

    rng = random.Random(seed)
    wins = pushes = losses = 0
    for _ in range(simulations):
        hidden = sample_hidden_state(
            state, rng, dealer_check_result=dealer_check_result
        )
        round_state = build_dealer_completion_round(
            state,
            dealer_check_result=dealer_check_result,
            resolved_shoe=hidden.shoe,
            resolved_dealer_hand=hidden.dealer_hand,
            resolved_user_hand=hidden.user_hand,
        )
        outcome = _simulate_round(round_state, rng)
        if outcome is Outcome.WIN:
            wins += 1
        elif outcome is Outcome.PUSH:
            pushes += 1
        else:
            losses += 1
    counts = OutcomeCounts(win=wins, push=pushes, loss=losses)
    outcomes = counts.distribution()
    if counts.total != simulations or not math.isclose(outcomes.total, 1.0):
        raise ExactAnalysisError(
            "simulation_mass_invalid",
            "Monte Carlo outcome counts do not match completed simulations.",
        )
    return MonteCarloEvaluation(
        counts=counts,
        outcomes=outcomes,
        simulations=simulations,
        seed=seed,
        cards_remaining=state.game_state.shoe.total_cards,
        known_cards=state.known_card_count,
        hidden_cards=state.unknown_card_count,
    )
