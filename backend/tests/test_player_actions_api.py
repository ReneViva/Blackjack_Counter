from copy import deepcopy

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def payload(
    cards: list[dict[str, str]],
    *,
    rules: dict[str, object] | None = None,
    hand: dict[str, object] | None = None,
) -> dict[str, object]:
    configured_rules: dict[str, object] = {
        "decks": 2,
        "dealer_soft_17": "stand",
        "splitting_enabled": True,
        "max_split_hands": 4,
        "resplit_aces": False,
        "hit_split_aces": False,
        "blackjack_after_split": False,
        "doubling_enabled": True,
        "double_after_split": True,
        "surrender": "none",
        "dealer_second_card": "hole_card",
        "dealer_blackjack_check": "no_peek",
    }
    configured_rules.update(rules or {})
    selected: dict[str, object] = {
        "seat": 4,
        "is_user": True,
        "hand_id": "seat-4-hand-1",
        "parent_hand_id": None,
        "split_depth": 0,
        "from_split_aces": False,
        "cards": cards,
    }
    selected.update(hand or {})
    return {
        "state": {
            "rules": configured_rules,
            "dealer": {"cards": []},
            "players": [selected],
            "discarded_cards": [],
        },
        "target": {"seat": 4, "hand_id": selected["hand_id"]},
    }


def split_result(request: dict[str, object]) -> dict[str, object]:
    response = client.post("/api/player-actions", json=request)
    assert response.status_code == 200
    return response.json()["split"]


def test_split_legality_accepts_an_exact_rank_pair() -> None:
    result = split_result(payload([known("8", "H"), known("8", "C")]))

    assert result == {"allowed": True, "code": None, "reason": None}


def test_split_legality_enforces_enabled_and_exact_rank_rules() -> None:
    disabled = split_result(
        payload(
            [known("8", "H"), known("8", "C")],
            rules={"splitting_enabled": False},
        )
    )
    mixed_tens = split_result(payload([known("10", "H"), known("J", "C")]))
    unknown = split_result(
        payload([known("8", "H"), {"kind": "unknown"}])
    )

    assert disabled["code"] == "splitting_disabled"
    assert "disabled" in str(disabled["reason"]).lower()
    assert mixed_tens["code"] == "exact_pair_required"
    assert unknown["code"] == "exact_pair_required"


def test_split_legality_enforces_maximum_hands_for_the_same_seat() -> None:
    request = payload(
        [known("8", "H"), known("8", "C")],
        rules={"max_split_hands": 2},
    )
    state = request["state"]
    assert isinstance(state, dict)
    players = state["players"]
    assert isinstance(players, list)
    sibling = deepcopy(players[0])
    sibling.update(
        {
            "is_user": False,
            "hand_id": "seat-4-hand-1-2",
            "parent_hand_id": "seat-4-hand-1",
            "split_depth": 1,
            "cards": [known("6", "S"), known("5", "D")],
        }
    )
    players[0].update(
        {
            "hand_id": "seat-4-hand-1-1",
            "parent_hand_id": "seat-4-hand-1",
            "split_depth": 1,
        }
    )
    players.append(sibling)
    request["target"] = {"seat": 4, "hand_id": "seat-4-hand-1-1"}

    result = split_result(request)

    assert result["code"] == "split_limit_reached"
    assert "maximum" in str(result["reason"]).lower()


def test_split_legality_enforces_resplit_ace_rule() -> None:
    request = payload(
        [known("A", "H"), known("A", "C")],
        rules={"resplit_aces": False},
        hand={
            "hand_id": "seat-4-hand-1-1",
            "parent_hand_id": "seat-4-hand-1",
            "split_depth": 1,
            "from_split_aces": True,
        },
    )

    blocked = split_result(request)
    request["state"]["rules"]["resplit_aces"] = True  # type: ignore[index]
    allowed = split_result(request)

    assert blocked["code"] == "resplit_aces_not_allowed"
    assert allowed["allowed"] is True


def test_split_legality_rejects_prior_decisions_and_missing_targets() -> None:
    acted = split_result(
        payload([known("8", "H"), known("8", "C"), known("2", "S")])
    )
    request = payload([known("8", "H"), known("8", "C")])
    request["target"] = {"seat": 4, "hand_id": "missing"}
    missing = split_result(request)

    assert acted["code"] == "split_after_decision"
    assert missing["code"] == "invalid_hand_target"
