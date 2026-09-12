from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass

from app.domain import (
    ALL_CARDS,
    Card,
    DealerBlackjackCheckRule,
    DealerCheckResult,
    DealerSecondCardRule,
    GameState,
    HandStatus,
    ObservedCard,
    Rank,
    RoundPhase,
    RoundState,
    UnknownCard,
)

from .state_builder import ReconstructedTableState


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str
    field: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    errors: tuple[ValidationIssue, ...] = ()
    warnings: tuple[ValidationIssue, ...] = ()

    @property
    def valid(self) -> bool:
        return not self.errors


def _all_observed_cards(state: ReconstructedTableState) -> Iterator[ObservedCard]:
    yield from state.dealer_hand.cards
    for player in state.players:
        yield from player.hand.cards
    yield from state.discarded_cards


def validate_table_state(state: ReconstructedTableState) -> ValidationResult:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    observed_cards = tuple(_all_observed_cards(state))
    known_cards = tuple(card for card in observed_cards if isinstance(card, Card))

    if state.deck_count is None:
        warnings.append(
            ValidationIssue(
                code="deck_count_unknown",
                message="Physical shoe limits cannot be verified without a deck count.",
                field="rules.decks",
            )
        )
    else:
        exact_counts = Counter(known_cards)
        for card in ALL_CARDS:
            count = exact_counts[card]
            if count > state.deck_count:
                errors.append(
                    ValidationIssue(
                        code="exact_card_multiplicity_exceeded",
                        message=(
                            f"Observed {count} copies of {card.rank.value}"
                            f"{card.suit.value}; a {state.deck_count}-deck shoe "
                            f"contains {state.deck_count}."
                        ),
                        field="cards",
                    )
                )

        rank_counts = Counter(card.rank for card in known_cards)
        for rank in Rank:
            count = rank_counts[rank]
            maximum = state.deck_count * 4
            if count > maximum:
                errors.append(
                    ValidationIssue(
                        code="rank_multiplicity_exceeded",
                        message=(
                            f"Observed {count} cards of rank {rank.value}; a "
                            f"{state.deck_count}-deck shoe contains {maximum}."
                        ),
                        field="cards",
                    )
                )

        physical_count = len(observed_cards)
        maximum_cards = state.deck_count * 52
        if physical_count > maximum_cards:
            unknown_count = sum(
                isinstance(card, UnknownCard) for card in observed_cards
            )
            errors.append(
                ValidationIssue(
                    code="shoe_capacity_exceeded",
                    message=(
                        f"Observed {physical_count} physical cards, including "
                        f"{unknown_count} unknown cards; the configured shoe "
                        f"contains {maximum_cards}."
                    ),
                    field="cards",
                )
            )

    if state.dealer_soft_17 is None:
        warnings.append(
            ValidationIssue(
                code="dealer_soft_17_unknown",
                message="Soft-17 behavior will be analyzed as separate rule scenarios.",
                field="rules.dealer_soft_17",
            )
        )
    seats = [player.seat for player in state.players]
    for seat in seats:
        if not 1 <= seat <= 7:
            errors.append(
                ValidationIssue(
                    code="seat_out_of_range",
                    message=f"Seat {seat} must be between 1 and 7.",
                    field="players",
                )
            )
    duplicate_seats = sorted(
        seat for seat, count in Counter(seats).items() if count > 1
    )
    for seat in duplicate_seats:
        errors.append(
            ValidationIssue(
                code="duplicate_seat",
                message=f"Seat {seat} appears more than once.",
                field="players",
            )
        )

    user_seats = [player.seat for player in state.players if player.is_user]
    if len(user_seats) > 1:
        errors.append(
            ValidationIssue(
                code="multiple_user_seats",
                message="At most one player seat may be marked as the user seat.",
                field="players",
            )
        )

    if state.game_state is not None:
        if state.deck_count != state.game_state.rules.decks:
            errors.append(
                ValidationIssue(
                    code="rule_deck_count_mismatch",
                    message="Submitted and reconstructed deck counts do not match.",
                    field="rules.decks",
                )
            )
        if state.dealer_soft_17 is not state.game_state.rules.dealer_soft_17:
            errors.append(
                ValidationIssue(
                    code="rule_soft_17_mismatch",
                    message="Submitted and reconstructed soft-17 rules do not match.",
                    field="rules.dealer_soft_17",
                )
            )

    return ValidationResult(errors=tuple(errors), warnings=tuple(warnings))


def validate_game_state(state: GameState) -> ValidationResult:
    errors: list[ValidationIssue] = []
    known_in_hands = Counter(
        card
        for hand in (state.dealer_hand, *state.player_hands)
        for card in hand.cards
        if isinstance(card, Card)
    )

    for card in ALL_CARDS:
        represented = state.shoe.count(card) + known_in_hands[card]
        if represented > state.rules.decks:
            errors.append(
                ValidationIssue(
                    code="game_state_card_multiplicity_exceeded",
                    message=(
                        f"State represents {represented} copies of "
                        f"{card.rank.value}{card.suit.value}; its rules allow "
                        f"{state.rules.decks}."
                    ),
                    field="shoe",
                )
            )

    unknown_in_hands = sum(
        isinstance(card, UnknownCard)
        for hand in (state.dealer_hand, *state.player_hands)
        for card in hand.cards
    )
    if unknown_in_hands > state.shoe.unknown_removed_count:
        errors.append(
            ValidationIssue(
                code="unknown_removal_count_mismatch",
                message=(
                    "The shoe has fewer latent removals than unknown cards "
                    "represented in active hands."
                ),
                field="shoe.unknown_removed_count",
            )
        )
    if state.shoe.total_cards < 0:
        errors.append(
            ValidationIssue(
                code="physical_shoe_count_negative",
                message="Physical cards remaining cannot be negative.",
                field="shoe",
            )
        )

    return ValidationResult(errors=tuple(errors))


def validate_round_state(state: RoundState) -> ValidationResult:
    errors = list(validate_game_state(state.game_state).errors)
    rules = state.game_state.rules

    if len(state.player_hands) != len(state.game_state.player_hands):
        errors.append(
            ValidationIssue(
                code="runtime_hand_count_mismatch",
                message="Runtime and structural player-hand counts must match.",
                field="player_hands",
            )
        )
    else:
        for index, player in enumerate(state.player_hands):
            if player.hand != state.game_state.player_hands[index]:
                errors.append(
                    ValidationIssue(
                        code="runtime_hand_mismatch",
                        message=(
                            f"Runtime hand {index} does not match structural state."
                        ),
                        field="player_hands",
                    )
                )

    for player in state.player_hands:
        if not 1 <= player.seat <= 7:
            errors.append(
                ValidationIssue(
                    code="seat_out_of_range",
                    message=f"Seat {player.seat} must be between 1 and 7.",
                    field="player_hands",
                )
            )
    seat_counts = Counter(player.seat for player in state.player_hands)
    for seat, count in seat_counts.items():
        if count > rules.max_split_hands:
            errors.append(
                ValidationIssue(
                    code="split_hand_limit_exceeded",
                    message=(
                        f"Seat {seat} has {count} hands; the configured maximum "
                        f"is {rules.max_split_hands}."
                    ),
                    field="player_hands",
                )
            )

    active_hands = [
        index
        for index, player in enumerate(state.player_hands)
        if player.status is HandStatus.ACTIVE
    ]
    if state.phase is RoundPhase.DEALER_CHECK:
        if state.active_hand_index is not None:
            errors.append(_phase_issue("Dealer check cannot have an active hand."))
        if state.dealer_check_result is not DealerCheckResult.PENDING:
            errors.append(_phase_issue("Dealer check phase requires a pending check."))
    elif state.phase is RoundPhase.PLAYER_TURNS:
        index = state.active_hand_index
        if index is None or not 0 <= index < len(state.player_hands):
            errors.append(_phase_issue("Player turns require an in-range active hand."))
        elif state.player_hands[index].status is not HandStatus.ACTIVE:
            errors.append(
                _phase_issue("The active index must reference an active hand.")
            )
        if state.dealer_check_result is DealerCheckResult.PENDING:
            errors.append(
                _phase_issue("Player turns cannot begin during a pending check.")
            )
    else:
        if state.active_hand_index is not None:
            errors.append(_phase_issue("This phase cannot have an active hand index."))
        if active_hands:
            errors.append(
                _phase_issue("This phase cannot contain active player hands.")
            )

    check_configured = (
        rules.dealer_second_card is DealerSecondCardRule.HOLE_CARD
        and rules.dealer_blackjack_check is DealerBlackjackCheckRule.PEEK
    )
    if state.dealer_check_result is DealerCheckResult.PENDING and not check_configured:
        errors.append(
            ValidationIssue(
                code="dealer_check_configuration_invalid",
                message="A pending dealer check is incompatible with the rules.",
                field="dealer_check_result",
            )
        )
    dealer_cards = state.game_state.dealer_hand.cards
    check_observation_eligible = (
        len(dealer_cards) >= 2
        and isinstance(dealer_cards[0], Card)
        and dealer_cards[0].rank
        in (Rank.ACE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING)
        and isinstance(dealer_cards[1], UnknownCard)
    )
    if (
        state.dealer_check_result is DealerCheckResult.PENDING
        and not check_observation_eligible
    ):
        errors.append(
            ValidationIssue(
                code="dealer_check_observation_invalid",
                message="A pending dealer check requires an eligible observed hand.",
                field="dealer_check_result",
            )
        )
    if (
        state.dealer_check_result
        in (DealerCheckResult.NO_BLACKJACK, DealerCheckResult.BLACKJACK)
        and not check_configured
    ):
        errors.append(
            ValidationIssue(
                code="dealer_check_configuration_invalid",
                message="A resolved dealer check is incompatible with the rules.",
                field="dealer_check_result",
            )
        )

    return ValidationResult(errors=tuple(errors))


def _phase_issue(message: str) -> ValidationIssue:
    return ValidationIssue(
        code="invalid_round_phase_metadata",
        message=message,
        field="phase",
    )
