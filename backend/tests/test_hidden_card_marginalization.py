from dataclasses import replace
import math

from app.domain import DealerCheckResult
from app.engine import build_table_state
from app.probability import analyze_exact_table, enumerate_hidden_states
from app.schemas import TableStateSchema


RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def hidden() -> dict[str, str]:
    return {"kind": "unknown"}


def state_with_available(
    *,
    dealer: list[dict[str, str]],
    player: list[dict[str, str]],
    available: set[tuple[str, str]],
    unknown_discards: int = 0,
    peek: bool = False,
):
    visible = {
        (card["rank"], card["suit"])
        for card in dealer + player
        if card["kind"] == "known"
    }
    discarded = [
        known(rank, suit)
        for rank in RANKS
        for suit in SUITS
        if (rank, suit) not in visible | available
    ] + [hidden() for _ in range(unknown_discards)]
    payload = TableStateSchema.model_validate(
        {
            "rules": {
                "decks": 1,
                "dealer_soft_17": "stand",
                "dealer_blackjack_check": "peek" if peek else "no_peek",
            },
            "dealer": {"cards": dealer},
            "players": [
                {"seat": 1, "is_user": True, "cards": player},
            ],
            "discarded_cards": discarded,
        }
    )
    return build_table_state(payload)


def test_one_unknown_with_one_possible_identity_matches_direct_solver() -> None:
    latent = state_with_available(
        dealer=[known("10", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("9", "S")},
    )
    branches = enumerate_hidden_states(latent)
    resolved = replace(
        latent,
        unknown_card_count=0,
        dealer_hand=branches.branches[0].dealer_hand,
        players=(replace(latent.players[0], hand=branches.branches[0].user_hand),),
        game_state=replace(
            latent.game_state,
            shoe=branches.branches[0].shoe,
            dealer_hand=branches.branches[0].dealer_hand,
            player_hands=(branches.branches[0].user_hand,),
        ),
    )

    assert analyze_exact_table(latent).outcomes == analyze_exact_table(resolved).outcomes
    assert branches.branches[0].weight == 1.0


def test_unequal_hidden_weights_produce_hand_calculated_marginal() -> None:
    state = state_with_available(
        dealer=[known("10", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("6", "S"), ("K", "S"), ("K", "D"), ("K", "C")},
    )

    hidden_states = enumerate_hidden_states(state)
    result = analyze_exact_table(state)

    assert sorted(branch.weight for branch in hidden_states.branches) == [0.25, 0.75]
    assert math.isclose(sum(branch.weight for branch in hidden_states.branches), 1.0)
    assert result.outcomes.win == 0.25
    assert result.outcomes.push == 0.75
    assert result.outcomes.loss == 0.0
    assert result.outcomes.total == 1.0


def test_multiple_background_unknowns_use_compositions_not_permutations() -> None:
    state = state_with_available(
        dealer=[known("10", "D"), known("9", "D")],
        player=[known("10", "H"), known("K", "H")],
        available={("A", "S"), ("A", "H"), ("K", "S")},
        unknown_discards=2,
    )

    hidden_states = enumerate_hidden_states(state)

    assert len(hidden_states.branches) == 2
    assert sorted(branch.weight for branch in hidden_states.branches) == [1 / 3, 2 / 3]
    assert math.isclose(sum(branch.weight for branch in hidden_states.branches), 1.0)


def test_no_blackjack_check_excludes_incompatible_holes_and_renormalizes() -> None:
    state = state_with_available(
        dealer=[known("A", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("9", "S"), ("K", "S"), ("K", "D"), ("K", "C")},
        peek=True,
    )

    unconditional = analyze_exact_table(state)
    conditioned_states = enumerate_hidden_states(
        state, dealer_check_result=DealerCheckResult.NO_BLACKJACK
    )
    conditioned = analyze_exact_table(
        state, dealer_check_result=DealerCheckResult.NO_BLACKJACK
    )

    assert unconditional.outcomes.loss == 0.75
    assert unconditional.outcomes.push == 0.25
    assert len(conditioned_states.branches) == 1
    assert conditioned_states.evidence_probability == 0.25
    assert conditioned_states.branches[0].weight == 1.0
    assert conditioned.outcomes.push == 1.0


def test_hidden_analysis_is_deterministic_and_does_not_mutate_input() -> None:
    state = state_with_available(
        dealer=[known("10", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("6", "S"), ("K", "S")},
    )
    original = state

    first = analyze_exact_table(state)
    second = analyze_exact_table(state)

    assert first == second
    assert state == original
    assert state.game_state is not None
    assert state.game_state.shoe.unknown_removed_count == 1


def test_value_only_hidden_composition_preserves_peek_conditioning() -> None:
    discarded = (
        [{"kind": "value", "value": "A"}] * 3
        + [
            {"kind": "value", "value": str(value)}
            for value in range(2, 9)
            for _ in range(4)
        ]
        + [{"kind": "value", "value": "9"}] * 3
        + [{"kind": "value", "value": "10"}] * 11
    )
    state = build_table_state(
        TableStateSchema.model_validate(
            {
                "rules": {
                    "decks": 1,
                    "dealer_soft_17": "stand",
                    "dealer_blackjack_check": "peek",
                },
                "dealer": {
                    "cards": [
                        {"kind": "value", "value": "A"},
                        {"kind": "unknown"},
                    ]
                },
                "players": [
                    {
                        "seat": 1,
                        "is_user": True,
                        "cards": [
                            {"kind": "value", "value": "10"},
                            {"kind": "value", "value": "10"},
                        ],
                    }
                ],
                "discarded_cards": discarded,
            }
        )
    )

    unconditional = analyze_exact_table(state)
    conditioned_states = enumerate_hidden_states(
        state,
        dealer_check_result=DealerCheckResult.NO_BLACKJACK,
    )
    conditioned = analyze_exact_table(
        state,
        dealer_check_result=DealerCheckResult.NO_BLACKJACK,
    )

    assert unconditional.outcomes.loss == 0.75
    assert unconditional.outcomes.push == 0.25
    assert len(conditioned_states.branches) == 1
    assert conditioned_states.evidence_probability == 0.25
    assert conditioned.outcomes.push == 1.0
    assert conditioned.outcomes.total == 1.0
