from dataclasses import dataclass
from typing import TypeAlias

from app.domain import (
    Card,
    Hand,
    PlayerHandState,
    Rank,
    RoundState,
    Rules,
    Shoe,
    ValueOnlyCard,
)


CanonicalKey: TypeAlias = tuple[object, ...]


def canonical_shoe_key(shoe: Shoe) -> tuple[object, ...]:
    if shoe.has_value_only_removals:
        return (
            "value_composition",
            shoe.decks,
            shoe.unknown_removed_count,
            tuple(count for _, count in shoe.value_composition),
        )
    rank_counts = tuple(
        sum(count for card, count in shoe.composition if card.rank is rank)
        for rank in Rank
    )
    return (shoe.decks, shoe.unknown_removed_count, rank_counts)


def canonical_hand_key(hand: Hand) -> tuple[str, ...]:
    return tuple(
        sorted(
            card.rank.value
            if isinstance(card, Card)
            else f"value:{card.value.value}"
            if isinstance(card, ValueOnlyCard)
            else "?"
            for card in hand.cards
        )
    )


def canonical_rules_key(rules: Rules) -> tuple[object, ...]:
    return (
        rules.decks,
        rules.dealer_soft_17.value,
        rules.splitting_enabled,
        rules.max_split_hands,
        rules.resplit_aces,
        rules.hit_split_aces,
        rules.blackjack_after_split,
        rules.doubling_enabled,
        rules.double_after_split,
        rules.surrender.value,
        rules.dealer_second_card.value,
        rules.dealer_blackjack_check.value,
    )


def _canonical_player_key(player: PlayerHandState) -> tuple[object, ...]:
    return (
        player.seat,
        canonical_hand_key(player.hand),
        player.status.value,
        player.split_depth,
        player.from_split_aces,
        player.decision_count,
        player.doubled,
    )


def canonical_round_key(
    state: RoundState, target_hand_index: int = 0
) -> CanonicalKey:
    return (
        "exact_dealer_completion_v1",
        canonical_shoe_key(state.game_state.shoe),
        canonical_hand_key(state.game_state.dealer_hand),
        tuple(_canonical_player_key(player) for player in state.player_hands),
        canonical_rules_key(state.game_state.rules),
        state.phase.value,
        state.active_hand_index,
        state.dealer_check_result.value,
        target_hand_index,
    )


@dataclass(frozen=True, slots=True)
class CacheMetrics:
    states_evaluated: int
    cache_hits: int
    cache_misses: int
