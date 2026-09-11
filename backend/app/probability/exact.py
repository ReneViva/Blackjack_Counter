from collections.abc import Callable
from dataclasses import dataclass

from app.domain import ALL_CARDS, Card, Rank, RoundPhase, RoundState, Shoe
from app.engine import (
    DealerStatus,
    advance_dealer,
    evaluate_dealer,
    resolve_outcomes,
    validate_round_state,
)

from .distribution import OutcomeDistribution, weighted_sum
from .memoization import CacheMetrics, CanonicalKey, canonical_round_key


_RANK_CARDS: dict[Rank, tuple[Card, ...]] = {
    rank: tuple(card for card in ALL_CARDS if card.rank is rank) for rank in Rank
}


class ExactAnalysisError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class PossibleDraw:
    rank: Rank
    count: int
    total: int
    probability: float
    card: Card


@dataclass(frozen=True, slots=True)
class ExactEvaluation:
    outcomes: OutcomeDistribution
    metrics: CacheMetrics


def _require_known_state(state: RoundState, target_hand_index: int) -> None:
    if state.game_state.shoe.unknown_removed_count:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact analysis requires every removed card identity to be resolved.",
        )
    if any(
        not isinstance(card, Card)
        for hand in (state.game_state.dealer_hand, *state.game_state.player_hands)
        for card in hand.cards
    ):
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact analysis requires every card in the analyzed hands to be known.",
        )
    validation = validate_round_state(state)
    if not validation.valid:
        raise ExactAnalysisError("invalid_state", validation.errors[0].message)
    if not 0 <= target_hand_index < len(state.player_hands):
        raise ExactAnalysisError(
            "invalid_state", "The exact-analysis target hand does not exist."
        )
    if state.phase not in (RoundPhase.DEALER_TURN, RoundPhase.ROUND_COMPLETE):
        raise ExactAnalysisError(
            "unsupported_exact_phase",
            "Exact dealer-completion analysis requires a finalized player hand.",
        )


def possible_draws(shoe: Shoe) -> tuple[PossibleDraw, ...]:
    if shoe.unknown_removed_count:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact draw probabilities require a fully resolved shoe composition.",
        )
    total = shoe.exact_total
    if total == 0:
        return ()

    draws: list[PossibleDraw] = []
    for rank in Rank:
        cards = _RANK_CARDS[rank]
        count = sum(shoe.count(card) for card in cards)
        if count == 0:
            continue
        representative = next(card for card in cards if shoe.count(card) > 0)
        draws.append(
            PossibleDraw(
                rank=rank,
                count=count,
                total=total,
                probability=count / total,
                card=representative,
            )
        )
    return tuple(draws)


def _terminal_distribution(
    state: RoundState, target_hand_index: int
) -> OutcomeDistribution:
    outcomes = resolve_outcomes(state)
    outcome = outcomes[target_hand_index]
    if outcome is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "The terminal outcome remains indeterminate.",
        )
    return OutcomeDistribution.terminal(outcome)


def _evaluate_state(
    state: RoundState,
    target_hand_index: int,
    evaluate_next: Callable[[RoundState], OutcomeDistribution],
) -> OutcomeDistribution:
    if state.phase is RoundPhase.ROUND_COMPLETE:
        return _terminal_distribution(state, target_hand_index)

    dealer = evaluate_dealer(state.game_state.dealer_hand, state.game_state.rules)
    if dealer.status is not DealerStatus.HIT_REQUIRED:
        return evaluate_next(
            advance_dealer(state),
        )

    draws = possible_draws(state.game_state.shoe)
    if not draws:
        raise ExactAnalysisError(
            "exact_shoe_exhausted",
            "The dealer must draw, but the exact shoe is empty.",
        )
    return weighted_sum(
        (
            draw.probability,
            evaluate_next(
                advance_dealer(state, draw.card),
            ),
        )
        for draw in draws
    )


def _evaluate_reference(
    state: RoundState, target_hand_index: int
) -> OutcomeDistribution:
    return _evaluate_state(
        state,
        target_hand_index,
        lambda next_state: _evaluate_reference(next_state, target_hand_index),
    )


def evaluate_exact_reference(
    state: RoundState, target_hand_index: int = 0
) -> OutcomeDistribution:
    """Enumerate exact dealer-completion outcomes without memoization."""
    _require_known_state(state, target_hand_index)
    result = _evaluate_reference(state, target_hand_index)
    if abs(result.total - 1.0) > 1e-10:
        raise ExactAnalysisError(
            "probability_mass_invalid",
            "Exact outcome probability mass does not sum to one.",
        )
    return result


def evaluate_exact(
    state: RoundState,
    target_hand_index: int = 0,
    *,
    max_states: int = 2_000_000,
) -> ExactEvaluation:
    """Enumerate exact outcomes with an isolated per-analysis cache."""
    _require_known_state(state, target_hand_index)
    if (
        isinstance(max_states, bool)
        or not isinstance(max_states, int)
        or max_states < 1
    ):
        raise ValueError("max_states must be a positive integer")

    cache: dict[CanonicalKey, OutcomeDistribution] = {}
    cache_hits = 0
    cache_misses = 0

    def evaluate(current: RoundState) -> OutcomeDistribution:
        nonlocal cache_hits, cache_misses
        key = canonical_round_key(current, target_hand_index)
        cached = cache.get(key)
        if cached is not None:
            cache_hits += 1
            return cached
        if cache_misses >= max_states:
            raise ExactAnalysisError(
                "exact_computation_limit",
                "Exact analysis exceeded the configured state limit.",
            )
        cache_misses += 1
        result = _evaluate_state(current, target_hand_index, evaluate)
        cache[key] = result
        return result

    outcomes = evaluate(state)
    if abs(outcomes.total - 1.0) > 1e-10:
        raise ExactAnalysisError(
            "probability_mass_invalid",
            "Exact outcome probability mass does not sum to one.",
        )
    return ExactEvaluation(
        outcomes=outcomes,
        metrics=CacheMetrics(
            states_evaluated=cache_misses,
            cache_hits=cache_hits,
            cache_misses=cache_misses,
        ),
    )
