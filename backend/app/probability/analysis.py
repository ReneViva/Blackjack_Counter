from dataclasses import dataclass

from app.domain import (
    DealerCheckResult,
    GameState,
    HandStatus,
    PlayerHandState,
    RoundPhase,
    RoundState,
)
from app.engine import (
    ReconstructedTableState,
    evaluate_dealer,
    evaluate_hand,
    validate_table_state,
)

from .distribution import OutcomeDistribution
from .exact import ExactAnalysisError, evaluate_exact
from .memoization import CacheMetrics


@dataclass(frozen=True, slots=True)
class ExactTableAnalysis:
    outcomes: OutcomeDistribution
    metrics: CacheMetrics
    cards_remaining: int
    known_cards: int
    hidden_cards: int


def _build_dealer_completion_round(
    state: ReconstructedTableState,
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
    value = evaluate_hand(user.hand)
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
        hand=user.hand,
        status=status,
        decision_count=1,
    )
    game_state = GameState(
        rules=state.game_state.rules,
        shoe=state.game_state.shoe,
        dealer_hand=state.dealer_hand,
        player_hands=(user.hand,),
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
        dealer_check_result=DealerCheckResult.NOT_REQUIRED,
    )


def analyze_exact_table(state: ReconstructedTableState) -> ExactTableAnalysis:
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        raise ExactAnalysisError("invalid_state", issue.message)
    if state.deck_count is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact analysis requires a known deck count.",
        )
    if state.unknown_card_count:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact analysis requires every observed card identity to be resolved.",
        )

    round_state = _build_dealer_completion_round(state)
    evaluation = evaluate_exact(round_state)
    return ExactTableAnalysis(
        outcomes=evaluation.outcomes,
        metrics=evaluation.metrics,
        cards_remaining=round_state.game_state.shoe.total_cards,
        known_cards=state.known_card_count,
        hidden_cards=state.unknown_card_count,
    )
