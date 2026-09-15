from collections.abc import Iterator
from dataclasses import dataclass
import math

from app.domain import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    DealerCheckResult,
    Hand,
    Rank,
    Shoe,
    UnknownCard,
    ValueOnlyCard,
    to_blackjack_value_class,
)
from app.engine import ReconstructedTableState, evaluate_hand

from .exact import ExactAnalysisError


_RANKS = tuple(Rank)
_VALUE_CLASSES = tuple(BlackjackValueClass)


@dataclass(frozen=True, slots=True)
class HiddenStateBranch:
    weight: float
    shoe: Shoe
    dealer_hand: Hand
    user_hand: Hand
    removed_rank_counts: tuple[int, ...]
    removed_value_counts: tuple[int, ...] | None = None


@dataclass(frozen=True, slots=True)
class HiddenStateEnumeration:
    branches: tuple[HiddenStateBranch, ...]
    states_evaluated: int
    evidence_probability: float


def _rank_counts(shoe: Shoe) -> tuple[int, ...]:
    return tuple(
        sum(count for card, count in shoe.composition if card.rank is rank)
        for rank in _RANKS
    )


def _value_counts(shoe: Shoe) -> tuple[int, ...]:
    return tuple(count for _, count in shoe.value_composition)


def _compositions(
    capacities: tuple[int, ...], total: int, index: int = 0
) -> Iterator[tuple[int, ...]]:
    if index == len(capacities) - 1:
        if 0 <= total <= capacities[index]:
            yield (total,)
        return
    remaining_capacity = sum(capacities[index + 1 :])
    minimum = max(0, total - remaining_capacity)
    maximum = min(capacities[index], total)
    for count in range(minimum, maximum + 1):
        for suffix in _compositions(capacities, total - count, index + 1):
            yield (count, *suffix)


def _relevant_sequences(
    removed: tuple[int, ...], length: int
) -> Iterator[tuple[tuple[int, ...], float]]:
    if length == 0:
        yield (), 1.0
        return

    counts = list(removed)

    def visit(depth: int, probability: float) -> Iterator[tuple[tuple[int, ...], float]]:
        if depth == length:
            yield (), probability
            return
        denominator = sum(counts)
        for rank_index, count in enumerate(counts):
            if count == 0:
                continue
            counts[rank_index] -= 1
            for suffix, branch_probability in visit(
                depth + 1, probability * count / denominator
            ):
                yield (rank_index, *suffix), branch_probability
            counts[rank_index] += 1

    yield from visit(0, 1.0)


def _remove_rank_counts(
    shoe: Shoe,
    removed: tuple[int, ...],
    relevant_sequence: tuple[int, ...],
) -> tuple[Shoe, tuple[Card, ...]]:
    counts = list(shoe.card_counts)
    selected: list[Card] = []
    selected_by_rank = [0] * len(_RANKS)

    def take(rank_index: int) -> Card:
        rank = _RANKS[rank_index]
        for card_index, card in enumerate(ALL_CARDS):
            if card.rank is rank and counts[card_index] > 0:
                counts[card_index] -= 1
                return card
        raise ExactAnalysisError(
            "invalid_hidden_state",
            "A hidden-card branch exceeded the available rank multiplicity.",
        )

    for rank_index in relevant_sequence:
        selected.append(take(rank_index))
        selected_by_rank[rank_index] += 1
    for rank_index, total_removed in enumerate(removed):
        for _ in range(total_removed - selected_by_rank[rank_index]):
            take(rank_index)
    return (
        Shoe(
            decks=shoe.decks,
            card_counts=tuple(counts),
            unknown_removed_count=0,
            value_only_removed_counts=shoe.value_only_removed_counts,
        ),
        tuple(selected),
    )


def _remove_value_counts(
    shoe: Shoe,
    removed: tuple[int, ...],
    relevant_sequence: tuple[int, ...],
) -> tuple[Shoe, tuple[ValueOnlyCard, ...]]:
    value_only_removed = list(shoe.value_only_removed_counts)
    for index, count in enumerate(removed):
        value_only_removed[index] += count
    selected = tuple(
        ValueOnlyCard(_VALUE_CLASSES[index]) for index in relevant_sequence
    )
    return (
        Shoe(
            decks=shoe.decks,
            card_counts=shoe.card_counts,
            unknown_removed_count=0,
            value_only_removed_counts=tuple(value_only_removed),
        ),
        selected,
    )


def _replace_unknowns(
    hand: Hand,
    cards: Iterator[Card | ValueOnlyCard],
) -> Hand:
    return Hand(
        cards=tuple(next(cards) if isinstance(card, UnknownCard) else card for card in hand.cards)
    )


def _blackjack_compatible(
    dealer_hand: Hand, dealer_check_result: DealerCheckResult
) -> bool:
    if dealer_check_result is DealerCheckResult.NOT_REQUIRED:
        return True
    dealer_blackjack = bool(
        len(dealer_hand.cards) >= 2
        and evaluate_hand(Hand(cards=dealer_hand.cards[:2])).blackjack
    )
    if dealer_check_result is DealerCheckResult.NO_BLACKJACK:
        return not dealer_blackjack
    if dealer_check_result is DealerCheckResult.BLACKJACK:
        return dealer_blackjack
    return False


def _draw_card(
    counts: list[int], rng, *, allowed=None
) -> tuple[int, Card]:
    eligible = [
        (index, card, count)
        for index, (card, count) in enumerate(zip(ALL_CARDS, counts, strict=True))
        if count > 0 and (allowed is None or allowed(card))
    ]
    total = sum(count for _, _, count in eligible)
    if total == 0:
        raise ExactAnalysisError(
            "dealer_check_evidence_impossible",
            "No hidden-card assignment is compatible with the observed dealer check.",
        )
    selection = rng.randrange(total)
    for index, card, count in eligible:
        if selection < count:
            counts[index] -= 1
            return index, card
        selection -= count
    raise AssertionError("weighted card selection did not resolve")


def _draw_value(
    counts: list[int], rng, *, allowed=None
) -> tuple[int, ValueOnlyCard]:
    eligible = [
        (index, ValueOnlyCard(value), count)
        for index, (value, count) in enumerate(
            zip(_VALUE_CLASSES, counts, strict=True)
        )
        if count > 0 and (allowed is None or allowed(ValueOnlyCard(value)))
    ]
    total = sum(count for _, _, count in eligible)
    if total == 0:
        raise ExactAnalysisError(
            "dealer_check_evidence_impossible",
            "No hidden-card assignment is compatible with the observed dealer check.",
        )
    selection = rng.randrange(total)
    for index, card, count in eligible:
        if selection < count:
            counts[index] -= 1
            return index, card
        selection -= count
    raise AssertionError("weighted value selection did not resolve")


def _observation_value(card: Card | ValueOnlyCard) -> BlackjackValueClass:
    return (
        to_blackjack_value_class(card.rank)
        if isinstance(card, Card)
        else card.value
    )


def sample_hidden_state(
    state: ReconstructedTableState,
    rng,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
) -> HiddenStateBranch:
    """Sample one latent assignment from finite card multiplicities."""
    if state.game_state is None:
        raise ExactAnalysisError(
            "simulation_requires_known_deck",
            "Monte Carlo simulation requires a concrete deck-count scenario.",
        )
    users = tuple(player for player in state.players if player.is_user)
    if len(users) != 1:
        raise ExactAnalysisError(
            "invalid_state", "Analysis requires exactly one player marked as the user."
        )
    if dealer_check_result is DealerCheckResult.PENDING:
        raise ExactAnalysisError(
            "dealer_check_pending", "Analysis requires the dealer check result to be resolved."
        )

    dealer_cards = list(state.dealer_hand.cards)
    user_cards = list(users[0].hand.cards)
    slots: list[tuple[str, int]] = []
    slots.extend(
        ("dealer", index)
        for index, card in enumerate(dealer_cards)
        if isinstance(card, UnknownCard)
    )
    slots.extend(
        ("user", index)
        for index, card in enumerate(user_cards)
        if isinstance(card, UnknownCard)
    )
    background_count = sum(
        isinstance(card, UnknownCard)
        for player in state.players
        if not player.is_user
        for card in player.hand.cards
    ) + sum(isinstance(card, UnknownCard) for card in state.discarded_cards)
    slots.extend(("background", index) for index in range(background_count))
    if len(slots) != state.game_state.shoe.unknown_removed_count:
        raise ExactAnalysisError(
            "invalid_state",
            "The latent removal count does not match the observed unknown cards.",
        )

    if dealer_check_result is not DealerCheckResult.NOT_REQUIRED:
        if len(dealer_cards) < 2 or not isinstance(
            dealer_cards[0], (Card, ValueOnlyCard)
        ):
            raise ExactAnalysisError(
                "dealer_check_evidence_invalid",
                "Dealer-check evidence requires a known eligible upcard and a second card.",
            )
        upcard = dealer_cards[0]
        if _observation_value(upcard) not in (
            BlackjackValueClass.ACE,
            BlackjackValueClass.TEN,
        ):
            raise ExactAnalysisError(
                "dealer_check_evidence_invalid",
                "Dealer-check evidence requires an Ace or ten-valued upcard.",
            )
        if isinstance(dealer_cards[1], (Card, ValueOnlyCard)) and not _blackjack_compatible(
            Hand(cards=tuple(dealer_cards)), dealer_check_result
        ):
            raise ExactAnalysisError(
                "dealer_check_evidence_impossible",
                "The known dealer hand contradicts the observed dealer check.",
            )

    shoe = state.game_state.shoe
    use_value_composition = shoe.has_value_only_removals
    counts = list(
        _value_counts(shoe) if use_value_composition else shoe.card_counts
    )
    removed_by_rank = [0] * len(_RANKS)
    removed_by_value = [0] * len(_VALUE_CLASSES)
    for kind, index in slots:
        allowed = None
        if (
            kind == "dealer"
            and index == 1
            and dealer_check_result is not DealerCheckResult.NOT_REQUIRED
        ):
            upcard = dealer_cards[0]

            def allowed(card: Card | ValueOnlyCard, upcard=upcard) -> bool:
                candidate = Hand(cards=(upcard, card))
                blackjack = bool(evaluate_hand(candidate).blackjack)
                return (
                    not blackjack
                    if dealer_check_result is DealerCheckResult.NO_BLACKJACK
                    else blackjack
                )

        if use_value_composition:
            selected_index, selected = _draw_value(counts, rng, allowed=allowed)
            removed_by_value[selected_index] += 1
        else:
            _, selected = _draw_card(counts, rng, allowed=allowed)
            removed_by_rank[_RANKS.index(selected.rank)] += 1
        if kind == "dealer":
            dealer_cards[index] = selected
        elif kind == "user":
            user_cards[index] = selected

    dealer_hand = Hand(cards=tuple(dealer_cards))
    user_hand = Hand(cards=tuple(user_cards))
    if not _blackjack_compatible(dealer_hand, dealer_check_result):
        raise ExactAnalysisError(
            "dealer_check_evidence_impossible",
            "The sampled dealer hand contradicts the observed dealer check.",
        )
    if use_value_composition:
        value_only_removed = tuple(
            existing + removed
            for existing, removed in zip(
                shoe.value_only_removed_counts,
                removed_by_value,
                strict=True,
            )
        )
        resolved_shoe = Shoe(
            decks=shoe.decks,
            card_counts=shoe.card_counts,
            unknown_removed_count=0,
            value_only_removed_counts=value_only_removed,
        )
    else:
        resolved_shoe = Shoe(
            decks=shoe.decks,
            card_counts=tuple(counts),
            unknown_removed_count=0,
        )
    return HiddenStateBranch(
        weight=1.0,
        shoe=resolved_shoe,
        dealer_hand=dealer_hand,
        user_hand=user_hand,
        removed_rank_counts=tuple(removed_by_rank),
        removed_value_counts=(
            tuple(removed_by_value) if use_value_composition else None
        ),
    )


def enumerate_hidden_states(
    state: ReconstructedTableState,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_states: int = 2_000_000,
) -> HiddenStateEnumeration:
    """Enumerate compatible latent rank compositions without sampling."""
    if state.game_state is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact hidden-card analysis requires a known deck count.",
        )
    users = tuple(player for player in state.players if player.is_user)
    if len(users) != 1:
        raise ExactAnalysisError(
            "invalid_state",
            "Exact analysis requires exactly one player marked as the user.",
        )
    if dealer_check_result is DealerCheckResult.PENDING:
        raise ExactAnalysisError(
            "dealer_check_pending",
            "Analysis requires the dealer check result to be resolved.",
        )
    if isinstance(max_states, bool) or not isinstance(max_states, int) or max_states < 1:
        raise ValueError("max_states must be a positive integer")

    shoe = state.game_state.shoe
    hidden_count = state.unknown_card_count
    if hidden_count != shoe.unknown_removed_count:
        raise ExactAnalysisError(
            "invalid_state",
            "The latent removal count does not match the observed unknown cards.",
        )
    if hidden_count == 0:
        if not _blackjack_compatible(state.dealer_hand, dealer_check_result):
            raise ExactAnalysisError(
                "dealer_check_evidence_impossible",
                "The known dealer hand contradicts the observed dealer check.",
            )
        return HiddenStateEnumeration(
            branches=(
                HiddenStateBranch(
                    weight=1.0,
                    shoe=shoe,
                    dealer_hand=state.dealer_hand,
                    user_hand=users[0].hand,
                    removed_rank_counts=(0,) * len(_RANKS),
                    removed_value_counts=(
                        (0,) * len(_VALUE_CLASSES)
                        if shoe.has_value_only_removals
                        else None
                    ),
                ),
            ),
            states_evaluated=0,
            evidence_probability=1.0,
        )

    relevant_count = sum(
        isinstance(card, UnknownCard)
        for hand in (state.dealer_hand, users[0].hand)
        for card in hand.cards
    )
    use_value_composition = shoe.has_value_only_removals
    available_counts = (
        _value_counts(shoe) if use_value_composition else _rank_counts(shoe)
    )
    denominator = math.comb(shoe.exact_total, hidden_count)
    if denominator == 0:
        raise ExactAnalysisError(
            "invalid_hidden_state", "No compatible hidden-card assignment exists."
        )

    raw_branches: list[HiddenStateBranch] = []
    raw_weights: list[float] = []
    states_evaluated = 0
    for removed in _compositions(available_counts, hidden_count):
        composition_weight = (
            math.prod(
                math.comb(capacity, count)
                for capacity, count in zip(available_counts, removed, strict=True)
            )
            / denominator
        )
        for sequence, assignment_weight in _relevant_sequences(
            removed, relevant_count
        ):
            states_evaluated += 1
            if states_evaluated > max_states:
                raise ExactAnalysisError(
                    "exact_computation_limit",
                    "Exact analysis exceeded the configured state limit.",
                )
            resolved_shoe, selected = (
                _remove_value_counts(shoe, removed, sequence)
                if use_value_composition
                else _remove_rank_counts(shoe, removed, sequence)
            )
            selected_cards = iter(selected)
            dealer_hand = _replace_unknowns(state.dealer_hand, selected_cards)
            user_hand = _replace_unknowns(users[0].hand, selected_cards)
            if not _blackjack_compatible(dealer_hand, dealer_check_result):
                continue
            weight = composition_weight * assignment_weight
            raw_weights.append(weight)
            raw_branches.append(
                HiddenStateBranch(
                    weight=weight,
                    shoe=resolved_shoe,
                    dealer_hand=dealer_hand,
                    user_hand=user_hand,
                    removed_rank_counts=(
                        (0,) * len(_RANKS)
                        if use_value_composition
                        else removed
                    ),
                    removed_value_counts=(
                        removed if use_value_composition else None
                    ),
                )
            )

    evidence_probability = math.fsum(raw_weights)
    if not raw_branches or evidence_probability <= 0.0:
        raise ExactAnalysisError(
            "dealer_check_evidence_impossible",
            "No hidden-card assignment is compatible with the observed dealer check.",
        )
    branches = tuple(
        HiddenStateBranch(
            weight=branch.weight / evidence_probability,
            shoe=branch.shoe,
            dealer_hand=branch.dealer_hand,
            user_hand=branch.user_hand,
            removed_rank_counts=branch.removed_rank_counts,
            removed_value_counts=branch.removed_value_counts,
        )
        for branch in raw_branches
    )
    if abs(math.fsum(branch.weight for branch in branches) - 1.0) > 1e-10:
        raise ExactAnalysisError(
            "probability_mass_invalid",
            "Hidden-state probability mass does not sum to one.",
        )
    return HiddenStateEnumeration(
        branches=branches,
        states_evaluated=states_evaluated,
        evidence_probability=evidence_probability,
    )
