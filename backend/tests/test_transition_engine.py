import pytest

from app.domain import (
    Card,
    DealerSoft17,
    GameState,
    Hand,
    Rank,
    Rules,
    Shoe,
    Suit,
    UnknownCard,
)
from app.engine import DrawTarget, TransitionError, build_shoe, draw_transition


AS = Card(rank=Rank.ACE, suit=Suit.SPADES)
FIVE_H = Card(rank=Rank.FIVE, suit=Suit.HEARTS)
TEN_C = Card(rank=Rank.TEN, suit=Suit.CLUBS)


def game_state(
    *,
    dealer_hand: Hand | None = None,
    player_hands: tuple[Hand, ...] = (Hand(),),
    soft_17: DealerSoft17 = DealerSoft17.STAND,
    shoe: Shoe | None = None,
) -> GameState:
    rules = Rules(decks=1, dealer_soft_17=soft_17)
    resolved_dealer_hand = dealer_hand or Hand()
    known_cards = tuple(
        card
        for current_hand in (resolved_dealer_hand, *player_hands)
        for card in current_hand.cards
        if isinstance(card, Card)
    )
    return GameState(
        rules=rules,
        shoe=shoe
        or build_shoe(
            1,
            known_cards,
            sum(
                isinstance(card, UnknownCard)
                for current_hand in (resolved_dealer_hand, *player_hands)
                for card in current_hand.cards
            ),
        ),
        dealer_hand=resolved_dealer_hand,
        player_hands=player_hands,
    )


def test_known_player_draw_removes_exactly_one_card_and_preserves_input() -> None:
    original = game_state()

    successor = draw_transition(original, DrawTarget.player(0), AS)

    assert successor is not original
    assert successor.player_hands[0].cards == (AS,)
    assert successor.shoe.count(AS) == 0
    assert successor.shoe.total_cards == original.shoe.total_cards - 1
    assert successor.rules is original.rules
    assert original.player_hands[0].cards == ()
    assert original.shoe.count(AS) == 1


def test_unknown_player_draw_preserves_unknown_identity_and_exact_shoe() -> None:
    original = game_state()
    unknown = UnknownCard()

    successor = draw_transition(original, DrawTarget.player(0), unknown)

    assert successor.player_hands[0].cards == (unknown,)
    assert isinstance(successor.player_hands[0].cards[0], UnknownCard)
    assert successor.shoe.card_counts == original.shoe.card_counts
    assert successor.shoe.unknown_removed_count == 1
    assert successor.shoe.total_cards == original.shoe.total_cards - 1


def test_dealer_draw_requires_policy_to_hit() -> None:
    original = game_state(
        dealer_hand=Hand(cards=(TEN_C, FIVE_H)),
    )

    successor = draw_transition(original, DrawTarget.dealer(), AS)

    assert successor.dealer_hand.cards == (TEN_C, FIVE_H, AS)
    assert successor.shoe.count(AS) == 0
    assert original.dealer_hand.cards == (TEN_C, FIVE_H)


def test_dealer_draw_rejects_terminal_state_without_mutation() -> None:
    original = game_state(
        dealer_hand=Hand(cards=(TEN_C, Card(Rank.SEVEN, Suit.DIAMONDS))),
    )

    with pytest.raises(TransitionError) as captured:
        draw_transition(original, DrawTarget.dealer(), AS)

    assert captured.value.code == "dealer_hit_not_required"
    assert original.shoe.count(AS) == 1
    assert original.dealer_hand.cards == (TEN_C, Card(Rank.SEVEN, Suit.DIAMONDS))


def test_unknown_dealer_state_rejects_without_fabrication() -> None:
    original = game_state(
        dealer_hand=Hand(cards=(UnknownCard(),)),
        shoe=Shoe(
            decks=1,
            card_counts=Shoe.fresh(1).card_counts,
            unknown_removed_count=1,
        ),
    )

    with pytest.raises(TransitionError) as captured:
        draw_transition(original, DrawTarget.dealer(), FIVE_H)

    assert captured.value.code == "dealer_action_indeterminate"
    assert original.shoe.count(FIVE_H) == 1


def test_unavailable_card_rejects_without_partial_transition() -> None:
    original = draw_transition(game_state(), DrawTarget.player(0), AS)

    with pytest.raises(TransitionError) as captured:
        draw_transition(original, DrawTarget.player(0), AS)

    assert captured.value.code == "card_unavailable"
    assert original.player_hands[0].cards == (AS,)
    assert original.shoe.count(AS) == 0


@pytest.mark.parametrize("index", (-1, 1, 10))
def test_invalid_player_target_rejects_without_mutation(index: int) -> None:
    original = game_state()

    with pytest.raises(TransitionError) as captured:
        draw_transition(original, DrawTarget.player(index), AS)

    assert captured.value.code == "player_index_out_of_range"
    assert original.player_hands[0].cards == ()
    assert original.shoe.count(AS) == 1


def test_same_transition_inputs_produce_equal_successors() -> None:
    original = game_state(player_hands=(Hand(), Hand()))

    first = draw_transition(original, DrawTarget.player(1), FIVE_H)
    second = draw_transition(original, DrawTarget.player(1), FIVE_H)

    assert first == second


def test_draw_target_rejects_malformed_runtime_values() -> None:
    with pytest.raises(ValueError, match="kind"):
        DrawTarget(kind="shoe")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="cannot include"):
        DrawTarget(kind="dealer", player_index=0)
    with pytest.raises(ValueError, match="requires"):
        DrawTarget(kind="player")
    with pytest.raises(TypeError, match="integer"):
        DrawTarget(kind="player", player_index=True)


def test_invalid_source_state_is_rejected_before_drawing() -> None:
    rules = Rules(decks=1, dealer_soft_17=DealerSoft17.STAND)
    inconsistent = GameState(
        rules=rules,
        shoe=Shoe.fresh(1),
        player_hands=(Hand(cards=(AS,)),),
    )

    with pytest.raises(TransitionError) as captured:
        draw_transition(inconsistent, DrawTarget.player(0), FIVE_H)

    assert captured.value.code == "invalid_source_state"
    assert inconsistent.shoe.count(FIVE_H) == 1
