from dataclasses import dataclass

from app.domain import (
    Card,
    DealerSoft17,
    GameState,
    Hand,
    ObservedCard,
    Rules,
    UnknownCard,
)
from app.schemas import (
    KnownCardSchema,
    ObservedCardSchema,
    PlayerHandSchema,
    TableStateSchema,
)

from .shoe_builder import build_shoe


@dataclass(frozen=True, slots=True)
class ReconstructedPlayerHand:
    seat: int
    is_user: bool
    hand: Hand


@dataclass(frozen=True, slots=True)
class ReconstructedTableState:
    deck_count: int | None
    dealer_soft_17: DealerSoft17
    dealer_hand: Hand
    players: tuple[ReconstructedPlayerHand, ...]
    discarded_cards: tuple[ObservedCard, ...]
    known_card_count: int
    unknown_card_count: int
    game_state: GameState | None


def build_observed_card(card: ObservedCardSchema) -> ObservedCard:
    if isinstance(card, KnownCardSchema):
        return Card(rank=card.rank, suit=card.suit)
    return UnknownCard()


def build_hand(cards: list[ObservedCardSchema]) -> Hand:
    return Hand(cards=tuple(build_observed_card(card) for card in cards))


def build_player(player: PlayerHandSchema) -> ReconstructedPlayerHand:
    return ReconstructedPlayerHand(
        seat=player.seat,
        is_user=player.is_user,
        hand=build_hand(player.cards),
    )


def build_table_state(payload: TableStateSchema) -> ReconstructedTableState:
    dealer_hand = build_hand(payload.dealer.cards)
    players = tuple(
        build_player(player)
        for player in sorted(payload.players, key=lambda item: item.seat)
    )
    discarded_cards = tuple(
        build_observed_card(card) for card in payload.discarded_cards
    )
    all_observed_cards = (
        dealer_hand.cards
        + tuple(card for player in players for card in player.hand.cards)
        + discarded_cards
    )
    known_cards = tuple(
        card for card in all_observed_cards if isinstance(card, Card)
    )
    unknown_card_count = sum(
        isinstance(card, UnknownCard) for card in all_observed_cards
    )

    game_state: GameState | None = None
    if payload.rules.decks is not None:
        rules = Rules(
            decks=payload.rules.decks,
            dealer_soft_17=payload.rules.dealer_soft_17,
        )
        game_state = GameState(
            rules=rules,
            shoe=build_shoe(payload.rules.decks, known_cards),
            dealer_hand=dealer_hand,
            player_hands=tuple(player.hand for player in players),
        )

    return ReconstructedTableState(
        deck_count=payload.rules.decks,
        dealer_soft_17=payload.rules.dealer_soft_17,
        dealer_hand=dealer_hand,
        players=players,
        discarded_cards=discarded_cards,
        known_card_count=len(known_cards),
        unknown_card_count=unknown_card_count,
        game_state=game_state,
    )
