from dataclasses import replace

import pytest

from app.domain import (
    BlackjackValueClass,
    Card,
    DealerBlackjackCheckRule,
    DealerCheckResult,
    DealerSecondCardRule,
    DealerSoft17,
    GameState,
    Hand,
    HandStatus,
    Outcome,
    PlayerAction,
    PlayerHandState,
    Rank,
    RoundPhase,
    RoundState,
    Rules,
    Shoe,
    Suit,
    SurrenderRule,
    UnknownCard,
    ValueOnlyCard,
)
from app.engine import (
    RevealTarget,
    TransitionError,
    advance_dealer,
    build_shoe,
    evaluate_hand,
    observe_split_replacement,
    player_action_decision,
    player_double,
    player_hit,
    player_split,
    player_stand,
    player_surrender,
    resolve_dealer_check,
    resolve_outcomes,
    reveal_unknown,
    start_round,
    validate_round_state,
)
from app.schemas import RulesSchema


def card(rank: Rank, suit: Suit) -> Card:
    return Card(rank, suit)


AS = card(Rank.ACE, Suit.SPADES)
AH = card(Rank.ACE, Suit.HEARTS)
AD = card(Rank.ACE, Suit.DIAMONDS)
TWO_S = card(Rank.TWO, Suit.SPADES)
THREE_S = card(Rank.THREE, Suit.SPADES)
FOUR_S = card(Rank.FOUR, Suit.SPADES)
FIVE_S = card(Rank.FIVE, Suit.SPADES)
SIX_H = card(Rank.SIX, Suit.HEARTS)
SIX_D = card(Rank.SIX, Suit.DIAMONDS)
SEVEN_S = card(Rank.SEVEN, Suit.SPADES)
SEVEN_D = card(Rank.SEVEN, Suit.DIAMONDS)
EIGHT_C = card(Rank.EIGHT, Suit.CLUBS)
EIGHT_H = card(Rank.EIGHT, Suit.HEARTS)
NINE_C = card(Rank.NINE, Suit.CLUBS)
TEN_S = card(Rank.TEN, Suit.SPADES)
TEN_H = card(Rank.TEN, Suit.HEARTS)
JACK_D = card(Rank.JACK, Suit.DIAMONDS)
KING_C = card(Rank.KING, Suit.CLUBS)


def make_game(
    *,
    rules: Rules | None = None,
    dealer: Hand = Hand(cards=(TEN_S, SIX_D)),
    players: tuple[Hand, ...] = (Hand(cards=(FIVE_S, SIX_H)),),
) -> GameState:
    resolved_rules = rules or Rules(1, DealerSoft17.STAND)
    known = tuple(
        observed
        for hand in (dealer, *players)
        for observed in hand.cards
        if isinstance(observed, (Card, ValueOnlyCard))
    )
    unknown_count = sum(
        isinstance(observed, UnknownCard)
        for hand in (dealer, *players)
        for observed in hand.cards
    )
    return GameState(
        rules=resolved_rules,
        shoe=build_shoe(resolved_rules.decks, known, unknown_count),
        dealer_hand=dealer,
        player_hands=players,
    )


def rules(**changes: object) -> Rules:
    return replace(Rules(1, DealerSoft17.STAND), **changes)


def test_value_only_dealer_upcard_preserves_peek_gate() -> None:
    peek = rules(
        dealer_second_card=DealerSecondCardRule.HOLE_CARD,
        dealer_blackjack_check=DealerBlackjackCheckRule.PEEK,
    )
    state = start_round(
        make_game(
            rules=peek,
            dealer=Hand(
                cards=(
                    ValueOnlyCard(BlackjackValueClass.ACE),
                    UnknownCard(),
                )
            ),
            players=(
                Hand(
                    cards=(
                        ValueOnlyCard(BlackjackValueClass.TEN),
                        ValueOnlyCard(BlackjackValueClass.EIGHT),
                    )
                ),
            ),
        )
    )

    assert state.phase is RoundPhase.DEALER_CHECK
    assert state.dealer_check_result is DealerCheckResult.PENDING
    assert validate_round_state(state).valid


def test_value_only_pair_does_not_invent_exact_rank_for_split_legality() -> None:
    state = start_round(
        make_game(
            players=(
                Hand(
                    cards=(
                        ValueOnlyCard(BlackjackValueClass.TEN),
                        ValueOnlyCard(BlackjackValueClass.TEN),
                    )
                ),
            )
        )
    )

    decision = player_action_decision(state, PlayerAction.SPLIT)

    assert decision.allowed is False
    assert decision.code == "exact_pair_required"


def test_extended_rule_defaults_and_transport_compatibility() -> None:
    domain = Rules(1, DealerSoft17.STAND)
    transport = RulesSchema.model_validate(
        {"decks": 1, "dealer_soft_17": "stand"}
    )

    assert domain.splitting_enabled is True
    assert domain.max_split_hands == 4
    assert domain.resplit_aces is False
    assert domain.hit_split_aces is False
    assert domain.blackjack_after_split is False
    assert domain.doubling_enabled is True
    assert domain.double_after_split is True
    assert domain.surrender is SurrenderRule.NONE
    assert domain.dealer_second_card is DealerSecondCardRule.HOLE_CARD
    assert domain.dealer_blackjack_check is DealerBlackjackCheckRule.NO_PEEK
    assert transport.max_split_hands == 4


@pytest.mark.parametrize(
    ("changes", "error_type"),
    [
        ({"max_split_hands": 0}, ValueError),
        ({"max_split_hands": 5}, ValueError),
        ({"max_split_hands": True}, TypeError),
        ({"splitting_enabled": True, "max_split_hands": 1}, ValueError),
        (
            {
                "dealer_second_card": DealerSecondCardRule.NO_HOLE_CARD,
                "dealer_blackjack_check": DealerBlackjackCheckRule.PEEK,
            },
            ValueError,
        ),
    ],
)
def test_extended_rules_reject_invalid_values(
    changes: dict[str, object], error_type: type[Exception]
) -> None:
    with pytest.raises(error_type):
        rules(**changes)


def test_all_new_rule_enum_values_construct() -> None:
    for surrender in SurrenderRule:
        for second_card in DealerSecondCardRule:
            for check in DealerBlackjackCheckRule:
                if (
                    second_card is DealerSecondCardRule.NO_HOLE_CARD
                    and check is DealerBlackjackCheckRule.PEEK
                ):
                    continue
                rules(
                    surrender=surrender,
                    dealer_second_card=second_card,
                    dealer_blackjack_check=check,
                )


def test_shoe_known_unknown_and_physical_totals() -> None:
    fresh = Shoe.fresh(1)
    known_removed = build_shoe(1, (AS,))
    latent_removed = build_shoe(1, (), 2)

    assert fresh.unknown_removed_count == 0
    assert fresh.total_cards == 52
    assert known_removed.count(AS) == 0
    assert known_removed.total_cards == 51
    assert latent_removed.count(AS) == 1
    assert latent_removed.exact_total == 52
    assert latent_removed.total_cards == 50
    with pytest.raises(ValueError):
        Shoe(1, fresh.card_counts, 53)


def test_split_blackjack_requires_explicit_rule_context() -> None:
    hand = Hand(cards=(AS, TEN_H))

    assert evaluate_hand(hand, split_origin=Rank.ACE).blackjack is False
    assert evaluate_hand(
        hand,
        split_origin=Rank.ACE,
        blackjack_after_split=True,
    ).blackjack is True


def test_dealer_check_gate_and_both_resolutions() -> None:
    peek = rules(dealer_blackjack_check=DealerBlackjackCheckRule.PEEK)
    game = make_game(
        rules=peek,
        dealer=Hand(cards=(AS, UnknownCard())),
    )
    pending = start_round(game)

    assert pending.phase is RoundPhase.DEALER_CHECK
    assert pending.dealer_check_result is DealerCheckResult.PENDING
    assert pending.active_hand_index is None
    with pytest.raises(TransitionError) as blocked:
        player_hit(pending, TWO_S)
    assert blocked.value.code == "dealer_check_pending"

    cleared = resolve_dealer_check(pending, DealerCheckResult.NO_BLACKJACK)
    complete = resolve_dealer_check(pending, DealerCheckResult.BLACKJACK)
    assert cleared.phase is RoundPhase.PLAYER_TURNS
    assert cleared.active_hand_index == 0
    assert complete.phase is RoundPhase.ROUND_COMPLETE
    assert all(hand.status is not HandStatus.ACTIVE for hand in complete.player_hands)
    assert complete.game_state.dealer_hand == game.dealer_hand


@pytest.mark.parametrize(
    "configured_rules",
    [
        rules(dealer_blackjack_check=DealerBlackjackCheckRule.NO_PEEK),
        rules(
            dealer_second_card=DealerSecondCardRule.NO_HOLE_CARD,
            dealer_blackjack_check=DealerBlackjackCheckRule.NO_PEEK,
        ),
        rules(dealer_blackjack_check=DealerBlackjackCheckRule.PEEK),
    ],
)
def test_dealer_check_not_required_cases(configured_rules: Rules) -> None:
    dealer = (
        Hand(cards=(NINE_C, UnknownCard()))
        if configured_rules.dealer_blackjack_check is DealerBlackjackCheckRule.PEEK
        else Hand(cards=(AS, UnknownCard()))
    )
    state = start_round(make_game(rules=configured_rules, dealer=dealer))
    assert state.phase is RoundPhase.PLAYER_TURNS
    assert state.dealer_check_result is DealerCheckResult.NOT_REQUIRED


def test_round_validation_enforces_phase_metadata_and_same_seat_limit() -> None:
    valid = start_round(make_game())
    invalid_phase = replace(valid, active_hand_index=None)
    assert validate_round_state(valid).valid
    assert {
        issue.code for issue in validate_round_state(invalid_phase).errors
    } == {"invalid_round_phase_metadata"}

    limited_rules = rules(max_split_hands=2)
    game = make_game(rules=limited_rules, players=(Hand(), Hand(), Hand()))
    hands = tuple(
        PlayerHandState(seat=1, hand=hand, status=HandStatus.STOOD)
        for hand in game.player_hands
    )
    over_limit = RoundState(
        game,
        hands,
        RoundPhase.ROUND_COMPLETE,
        None,
        DealerCheckResult.NOT_REQUIRED,
    )
    assert "split_hand_limit_exceeded" in {
        issue.code for issue in validate_round_state(over_limit).errors
    }


def test_hit_known_unknown_bust_and_twenty_one_lifecycle() -> None:
    original = start_round(make_game(players=(Hand(cards=(TEN_H, SIX_H)),)))
    busted = player_hit(original, EIGHT_C)

    assert busted.player_hands[0].status is HandStatus.BUST
    assert busted.phase is RoundPhase.ROUND_COMPLETE
    assert busted.game_state.shoe.count(EIGHT_C) == 0
    assert original.game_state.shoe.count(EIGHT_C) == 1

    twenty = start_round(make_game(players=(Hand(cards=(TEN_H, FIVE_S)),)))
    stood = player_hit(twenty, SIX_H)
    assert stood.player_hands[0].status is HandStatus.STOOD
    assert stood.phase is RoundPhase.DEALER_TURN

    unknown_start = start_round(make_game(players=(Hand(cards=(TEN_H, FIVE_S)),)))
    unknown = player_hit(unknown_start, UnknownCard())
    assert unknown.player_hands[0].status is HandStatus.ACTIVE
    assert unknown.game_state.shoe.unknown_removed_count == 1
    with pytest.raises(TransitionError) as indeterminate:
        player_hit(unknown, TWO_S)
    assert indeterminate.value.code == "hand_indeterminate"


def test_stand_advances_hands_then_dealer() -> None:
    original = start_round(
        make_game(players=(Hand(cards=(TEN_H, FIVE_S)), Hand(cards=(NINE_C, SIX_H)))),
        seats=(1, 2),
    )

    second = player_stand(original)
    dealer_turn = player_stand(second)
    assert second.active_hand_index == 1
    assert second.player_hands[0].decision_count == 1
    assert dealer_turn.phase is RoundPhase.DEALER_TURN
    assert dealer_turn.active_hand_index is None


def test_double_rules_and_bookkeeping() -> None:
    original = start_round(make_game(players=(Hand(cards=(FIVE_S, SIX_H)),)))
    doubled = player_double(original, TEN_H)

    assert doubled.player_hands[0].doubled is True
    assert doubled.player_hands[0].decision_count == 1
    assert doubled.player_hands[0].status is HandStatus.STOOD
    assert doubled.game_state.shoe.count(TEN_H) == 0

    disabled = start_round(
        make_game(
            rules=rules(doubling_enabled=False),
            players=(Hand(cards=(FIVE_S, SIX_H)),),
        )
    )
    with pytest.raises(TransitionError) as rejected:
        player_double(disabled, TEN_H)
    assert rejected.value.code == "double_not_allowed"

    after_hit = player_hit(original, TWO_S)
    with pytest.raises(TransitionError) as after_action:
        player_double(after_hit, THREE_S)
    assert after_action.value.code == "double_not_allowed"

    unknown_double = player_double(original, UnknownCard())
    assert unknown_double.player_hands[0].status is HandStatus.STOOD
    assert unknown_double.game_state.shoe.unknown_removed_count == 1


def test_late_surrender_conditions_and_direct_completion() -> None:
    enabled = start_round(
        make_game(
            rules=rules(surrender=SurrenderRule.LATE),
            players=(Hand(cards=(TEN_H, SIX_H)),),
        )
    )
    surrendered = player_surrender(enabled)
    assert surrendered.player_hands[0].status is HandStatus.SURRENDERED
    assert surrendered.phase is RoundPhase.ROUND_COMPLETE

    disabled = start_round(make_game(players=(Hand(cards=(TEN_H, SIX_H)),)))
    with pytest.raises(TransitionError) as rejected:
        player_surrender(disabled)
    assert rejected.value.code == "surrender_not_allowed"

    acted = player_hit(enabled, TWO_S)
    with pytest.raises(TransitionError) as after_action:
        player_surrender(acted)
    assert after_action.value.code == "surrender_not_allowed"


def test_split_order_rank_identity_and_known_unknown_bookkeeping() -> None:
    original = start_round(
        make_game(players=(Hand(cards=(EIGHT_C, card(Rank.EIGHT, Suit.DIAMONDS))),))
    )
    split = player_split(original)

    assert split.player_hands[0].hand.cards == (EIGHT_C,)
    assert split.player_hands[1].hand.cards == (
        card(Rank.EIGHT, Suit.DIAMONDS),
    )
    assert tuple(hand.seat for hand in split.player_hands) == (1, 1)
    assert split.game_state.shoe == original.game_state.shoe
    assert tuple(hand.hand_id for hand in split.player_hands) == (
        "seat-1-hand-1-1",
        "seat-1-hand-1-2",
    )
    assert split.active_hand_index == 0

    observed = observe_split_replacement(
        observe_split_replacement(split, "seat-1-hand-1-1", TWO_S),
        "seat-1-hand-1-2",
        UnknownCard(),
    )
    assert observed.player_hands[0].hand.cards == (EIGHT_C, TWO_S)
    assert isinstance(observed.player_hands[1].hand.cards[1], UnknownCard)
    assert observed.game_state.shoe.count(TWO_S) == 0
    assert observed.game_state.shoe.unknown_removed_count == 1

    not_pair = start_round(make_game(players=(Hand(cards=(TEN_H, KING_C)),)))
    with pytest.raises(TransitionError) as rejected:
        player_split(not_pair)
    assert rejected.value.code == "exact_pair_required"


def test_split_limit_and_double_after_split() -> None:
    base = start_round(
        make_game(
            rules=rules(max_split_hands=2, double_after_split=False),
            players=(Hand(cards=(EIGHT_C, card(Rank.EIGHT, Suit.DIAMONDS))),),
        )
    )
    split = player_split(base)
    split = observe_split_replacement(split, "seat-1-hand-1-1", EIGHT_H)
    assert (
        player_action_decision(split, PlayerAction.SPLIT).code
        == "split_limit_reached"
    )
    with pytest.raises(TransitionError) as no_double:
        player_double(split, THREE_S)
    assert no_double.value.code == "double_not_allowed"
    with pytest.raises(TransitionError) as no_surrender:
        player_surrender(split)
    assert no_surrender.value.code == "surrender_not_allowed"


def test_split_limit_counts_only_hands_from_the_same_seat() -> None:
    original = start_round(
        make_game(
            rules=rules(max_split_hands=2),
            players=(
                Hand(cards=(EIGHT_C, card(Rank.EIGHT, Suit.DIAMONDS))),
                Hand(cards=(NINE_C, SIX_H)),
            ),
        ),
        seats=(1, 2),
    )

    split = player_split(original)
    assert tuple(hand.seat for hand in split.player_hands) == (1, 1, 2)


def test_double_after_split_is_allowed_when_configured() -> None:
    original = start_round(
        make_game(
            players=(Hand(cards=(EIGHT_C, card(Rank.EIGHT, Suit.DIAMONDS))),),
        )
    )
    split = player_split(original)
    split = observe_split_replacement(split, "seat-1-hand-1-1", TWO_S)
    doubled = player_double(split, FOUR_S)
    assert doubled.player_hands[0].doubled is True
    assert doubled.player_hands[0].status is HandStatus.STOOD


@pytest.mark.parametrize("blackjack_after_split", [False, True])
def test_split_aces_terminal_and_blackjack_configuration(
    blackjack_after_split: bool,
) -> None:
    configured = rules(blackjack_after_split=blackjack_after_split)
    original = start_round(
        make_game(rules=configured, players=(Hand(cards=(AS, AH)),))
    )
    split = player_split(original)
    split = observe_split_replacement(split, "seat-1-hand-1-1", TEN_H)
    split = observe_split_replacement(split, "seat-1-hand-1-2", NINE_C)
    expected = HandStatus.BLACKJACK if blackjack_after_split else HandStatus.STOOD
    assert split.player_hands[0].status is expected
    assert split.player_hands[1].status is HandStatus.STOOD
    assert split.phase is RoundPhase.DEALER_TURN


def test_resplit_aces_disabled_and_enabled() -> None:
    disabled = start_round(
        make_game(
            rules=rules(resplit_aces=False),
            players=(Hand(cards=(AS, AH)),),
        )
    )
    terminal = player_split(disabled)
    terminal = observe_split_replacement(
        terminal, "seat-1-hand-1-1", AD
    )
    assert terminal.player_hands[0].status is HandStatus.STOOD

    enabled = start_round(
        make_game(
            rules=rules(resplit_aces=True),
            players=(Hand(cards=(AS, AH)),),
        )
    )
    resplittable = player_split(enabled)
    resplittable = observe_split_replacement(
        resplittable, "seat-1-hand-1-1", AD
    )
    assert resplittable.player_hands[0].status is HandStatus.ACTIVE
    assert player_action_decision(resplittable, PlayerAction.SPLIT).allowed
    assert not player_action_decision(resplittable, PlayerAction.HIT).allowed


def test_hit_split_aces_allows_normal_play() -> None:
    original = start_round(
        make_game(
            rules=rules(hit_split_aces=True),
            players=(Hand(cards=(AS, AH)),),
        )
    )
    split = player_split(original)
    split = observe_split_replacement(split, "seat-1-hand-1-1", TWO_S)
    assert split.player_hands[0].status is HandStatus.ACTIVE
    assert player_action_decision(split, PlayerAction.HIT).allowed


def test_dealer_advance_requires_explicit_hit_and_completes() -> None:
    player = Hand(cards=(TEN_H, SEVEN_D))
    state = player_stand(start_round(make_game(players=(player,))))
    assert state.phase is RoundPhase.DEALER_TURN
    with pytest.raises(TransitionError) as missing:
        advance_dealer(state)
    assert missing.value.code == "action_not_allowed"

    completed = advance_dealer(state, TWO_S)
    assert completed.phase is RoundPhase.ROUND_COMPLETE
    assert completed.game_state.dealer_hand.cards[-1] == TWO_S

    standing_game = make_game(
        dealer=Hand(cards=(TEN_S, SEVEN_S)),
        players=(player,),
    )
    standing = player_stand(start_round(standing_game))
    assert advance_dealer(standing).phase is RoundPhase.ROUND_COMPLETE
    with pytest.raises(TransitionError):
        advance_dealer(standing, TWO_S)
    with pytest.raises(TransitionError) as player_wrong_phase:
        player_hit(standing, THREE_S)
    assert player_wrong_phase.value.code == "wrong_phase"


def test_dealer_indeterminate_blocks_until_reveal() -> None:
    state = player_stand(
        start_round(
            make_game(
                dealer=Hand(cards=(TEN_S, UnknownCard())),
                players=(Hand(cards=(TEN_H, SEVEN_D)),),
            )
        )
    )
    with pytest.raises(TransitionError) as blocked:
        advance_dealer(state)
    assert blocked.value.code == "hand_indeterminate"
    revealed = reveal_unknown(state, RevealTarget.dealer(1), SEVEN_S)
    assert revealed.game_state.shoe.total_cards == state.game_state.shoe.total_cards
    assert advance_dealer(revealed).phase is RoundPhase.ROUND_COMPLETE


def test_unknown_reveal_player_bookkeeping_and_errors() -> None:
    original = player_hit(
        start_round(make_game(players=(Hand(cards=(TEN_H, FIVE_S)),))),
        UnknownCard(),
    )
    physical_total = original.game_state.shoe.total_cards
    revealed = reveal_unknown(original, RevealTarget.player(0, 2), TWO_S)

    assert revealed.player_hands[0].hand.cards[-1] == TWO_S
    assert revealed.game_state.shoe.count(TWO_S) == 0
    assert revealed.game_state.shoe.unknown_removed_count == 0
    assert revealed.game_state.shoe.total_cards == physical_total
    with pytest.raises(TransitionError) as not_unknown:
        reveal_unknown(revealed, RevealTarget.player(0, 0), THREE_S)
    assert not_unknown.value.code == "unknown_removal_unavailable"


def test_reveal_conflicting_with_no_blackjack_check_is_rejected() -> None:
    peek = rules(dealer_blackjack_check=DealerBlackjackCheckRule.PEEK)
    pending = start_round(
        make_game(rules=peek, dealer=Hand(cards=(AS, UnknownCard())))
    )
    cleared = resolve_dealer_check(pending, DealerCheckResult.NO_BLACKJACK)
    with pytest.raises(TransitionError) as conflict:
        reveal_unknown(cleared, RevealTarget.dealer(1), TEN_H)
    assert conflict.value.code == "reveal_conflicts_with_dealer_check"
    assert isinstance(cleared.game_state.dealer_hand.cards[1], UnknownCard)


def test_late_surrender_after_no_blackjack_check() -> None:
    peek = rules(
        surrender=SurrenderRule.LATE,
        dealer_blackjack_check=DealerBlackjackCheckRule.PEEK,
    )
    pending = start_round(
        make_game(rules=peek, dealer=Hand(cards=(AS, UnknownCard())))
    )
    cleared = resolve_dealer_check(pending, DealerCheckResult.NO_BLACKJACK)
    assert player_surrender(cleared).player_hands[0].status is HandStatus.SURRENDERED


def test_reveal_rejects_invalid_location_and_unavailable_card() -> None:
    original = player_hit(
        start_round(make_game(players=(Hand(cards=(TEN_H, FIVE_S)),))),
        UnknownCard(),
    )
    with pytest.raises(TransitionError) as invalid_index:
        reveal_unknown(original, RevealTarget.player(0, 10), TWO_S)
    assert invalid_index.value.code == "reveal_target_not_unknown"

    with pytest.raises(TransitionError) as known_target:
        reveal_unknown(original, RevealTarget.player(0, 0), TWO_S)
    assert known_target.value.code == "reveal_target_not_unknown"

    no_two = replace(
        original,
        game_state=replace(
            original.game_state,
            shoe=replace(
                original.game_state.shoe,
                card_counts=tuple(
                    0 if exact == TWO_S else count
                    for exact, count in original.game_state.shoe.composition
                ),
            ),
        ),
    )
    with pytest.raises(TransitionError) as unavailable:
        reveal_unknown(no_two, RevealTarget.player(0, 2), TWO_S)
    assert unavailable.value.code == "card_unavailable"


def completed_state(
    player: Hand,
    dealer: Hand,
    *,
    player_status: HandStatus = HandStatus.STOOD,
    check: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
) -> RoundState:
    configured_rules = (
        rules(dealer_blackjack_check=DealerBlackjackCheckRule.PEEK)
        if check is not DealerCheckResult.NOT_REQUIRED
        else rules()
    )
    game = make_game(rules=configured_rules, dealer=dealer, players=(player,))
    return RoundState(
        game,
        (PlayerHandState(1, player, status=player_status),),
        RoundPhase.ROUND_COMPLETE,
        None,
        check,
    )


@pytest.mark.parametrize(
    ("player", "dealer", "status", "check", "expected"),
    [
        pytest.param(
            Hand(cards=(TEN_H, SIX_H)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.SURRENDERED,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.LOSS,
        ),
        pytest.param(
            Hand(cards=(TEN_H, KING_C, TWO_S)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.BUST,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.LOSS,
        ),
        pytest.param(
            Hand(cards=(TEN_H, SEVEN_D)),
            Hand(cards=(TEN_S, KING_C, TWO_S)),
            HandStatus.STOOD,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.WIN,
        ),
        pytest.param(
            Hand(cards=(AS, TEN_H)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.BLACKJACK,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.WIN,
        ),
        pytest.param(
            Hand(cards=(AS, TEN_H)),
            Hand(cards=(AH, UnknownCard())),
            HandStatus.BLACKJACK,
            DealerCheckResult.BLACKJACK,
            Outcome.PUSH,
        ),
        pytest.param(
            Hand(cards=(TEN_H, EIGHT_C)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.STOOD,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.WIN,
        ),
        pytest.param(
            Hand(cards=(TEN_H, SEVEN_D)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.STOOD,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.PUSH,
        ),
        pytest.param(
            Hand(cards=(TEN_H, SIX_H)),
            Hand(cards=(TEN_S, SEVEN_S)),
            HandStatus.STOOD,
            DealerCheckResult.NOT_REQUIRED,
            Outcome.LOSS,
        ),
    ],
)
def test_outcome_resolution_precedence(
    player: Hand,
    dealer: Hand,
    status: HandStatus,
    check: DealerCheckResult,
    expected: Outcome,
) -> None:
    assert resolve_outcomes(
        completed_state(player, dealer, player_status=status, check=check)
    ) == (expected,)


def test_outcome_remains_none_when_required_value_is_unknown() -> None:
    state = completed_state(
        Hand(cards=(TEN_H, SIX_H)),
        Hand(cards=(TEN_S, UnknownCard())),
    )
    assert resolve_outcomes(state) == (None,)


def test_round_transitions_are_immutable_and_deterministic() -> None:
    original = start_round(make_game(players=(Hand(cards=(FIVE_S, SIX_H)),)))
    first = player_hit(original, TWO_S)
    second = player_hit(original, TWO_S)

    assert first == second
    assert original.player_hands[0].hand.cards == (FIVE_S, SIX_H)
    assert original.game_state.shoe.count(TWO_S) == 1
