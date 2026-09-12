from dataclasses import dataclass
import math

from app.domain import (
    DealerCheckResult,
    GameState,
    Hand,
    HandStatus,
    PlayerHandState,
    RoundPhase,
    RoundState,
    Shoe,
)
from app.engine import (
    ReconstructedTableState,
    evaluate_dealer,
    evaluate_hand,
    validate_table_state,
)

from .distribution import OutcomeDistribution, weighted_sum
from .exact import ExactAnalysisError, evaluate_exact
from .hidden_cards import enumerate_hidden_states
from .memoization import CacheMetrics


@dataclass(frozen=True, slots=True)
class ExactTableAnalysis:
    outcomes: OutcomeDistribution
    metrics: CacheMetrics
    cards_remaining: int
    known_cards: int
    hidden_cards: int
    hidden_states_evaluated: int = 0
    hidden_weight_mass: float = 1.0


def build_dealer_completion_round(
    state: ReconstructedTableState,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    resolved_shoe: Shoe | None = None,
    resolved_dealer_hand: Hand | None = None,
    resolved_user_hand: Hand | None = None,
) -> RoundState:
    if state.game_state is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact analysis requires a known deck count.",
        )
    users = tuple(player for player in state.players if player.is_user)
    if len(users) != 1:
        raise ExactAnalysisError(
            "invalid_state",
            "Exact analysis requires exactly one player marked as the user.",
        )
    user = users[0]
    user_hand = resolved_user_hand or user.hand
    dealer_hand = resolved_dealer_hand or state.dealer_hand
    shoe = resolved_shoe or state.game_state.shoe
    value = evaluate_hand(user_hand)
    if not value.determinate:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact analysis requires the user hand to contain only known cards.",
        )
    if value.bust:
        status = HandStatus.BUST
    elif value.blackjack:
        status = HandStatus.BLACKJACK
    else:
        status = HandStatus.STOOD

    player = PlayerHandState(
        seat=user.seat,
        hand=user_hand,
        status=status,
        decision_count=1,
    )
    game_state = GameState(
        rules=state.game_state.rules,
        shoe=shoe,
        dealer_hand=dealer_hand,
        player_hands=(user_hand,),
    )
    dealer = evaluate_dealer(game_state.dealer_hand, game_state.rules)
    phase = (
        RoundPhase.ROUND_COMPLETE
        if status is HandStatus.BUST or dealer.terminal
        else RoundPhase.DEALER_TURN
    )
    return RoundState(
        game_state=game_state,
        player_hands=(player,),
        phase=phase,
        active_hand_index=None,
        dealer_check_result=dealer_check_result,
    )


def analyze_exact_table(
    state: ReconstructedTableState,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_states: int = 2_000_000,
) -> ExactTableAnalysis:
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        raise ExactAnalysisError("invalid_state", issue.message)
    if state.deck_count is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact analysis requires a known deck count.",
        )
    hidden = enumerate_hidden_states(
        state,
        dealer_check_result=dealer_check_result,
        max_states=max_states,
    )
    weighted_results: list[tuple[float, OutcomeDistribution]] = []
    cache_hits = 0
    cache_misses = 0
    remaining_states = max_states - hidden.states_evaluated
    for branch in hidden.branches:
        if remaining_states < 1:
            raise ExactAnalysisError(
                "exact_computation_limit",
                "Exact analysis exceeded the configured state limit.",
            )
        round_state = build_dealer_completion_round(
            state,
            dealer_check_result=dealer_check_result,
            resolved_shoe=branch.shoe,
            resolved_dealer_hand=branch.dealer_hand,
            resolved_user_hand=branch.user_hand,
        )
        evaluation = evaluate_exact(round_state, max_states=remaining_states)
        cache_hits += evaluation.metrics.cache_hits
        cache_misses += evaluation.metrics.cache_misses
        remaining_states -= evaluation.metrics.states_evaluated
        weighted_results.append((branch.weight, evaluation.outcomes))
    outcomes = weighted_sum(weighted_results)
    if abs(outcomes.total - 1.0) > 1e-10:
        raise ExactAnalysisError(
            "probability_mass_invalid",
            "Marginalized outcome probability mass does not sum to one.",
        )
    return ExactTableAnalysis(
        outcomes=outcomes,
        metrics=CacheMetrics(
            states_evaluated=hidden.states_evaluated + cache_misses,
            cache_hits=cache_hits,
            cache_misses=cache_misses,
        ),
        cards_remaining=state.game_state.shoe.total_cards,
        known_cards=state.known_card_count,
        hidden_cards=state.unknown_card_count,
        hidden_states_evaluated=hidden.states_evaluated,
        hidden_weight_mass=math.fsum(branch.weight for branch in hidden.branches),
    )
