from copy import deepcopy
import math

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)
RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def player(seat: int, hand_id: str, cards: list[dict[str, str]]) -> dict[str, object]:
    return {
        "seat": seat,
        "is_user": False,
        "hand_id": hand_id,
        "cards": cards,
    }


def deterministic_split_state(*, decks: int | None = 1) -> dict[str, object]:
    return {
        "rules": {"decks": decks, "dealer_soft_17": "stand", "max_split_hands": 4},
        "dealer": {"cards": [known("10", "C"), known("7", "C")]},
        "players": [
            player(4, "left", [known("10", "H"), known("K", "H")]),
            player(4, "right", [known("8", "S"), known("8", "H")]),
        ],
        "discarded_cards": [],
    }


def dense_split_state(hand_count: int = 2) -> dict[str, object]:
    hands = [
        player(4, "hand-1", [known("10", "H"), known("K", "H")]),
        player(4, "hand-2", [known("8", "S"), known("8", "H")]),
        player(4, "hand-3", [known("A", "S"), known("9", "S")]),
        player(4, "hand-4", [known("7", "D"), known("9", "D")]),
    ][:hand_count]
    dealer = [known("6", "D"), known("10", "C")]
    retained = {("5", "S"), ("10", "S")}
    observed = {
        (card["rank"], card["suit"])
        for card in dealer + [card for hand in hands for card in hand["cards"]]
    }
    discarded = [
        known(rank, suit)
        for rank in RANKS
        for suit in SUITS
        if (rank, suit) not in retained | observed
    ]
    return {
        "rules": {"decks": 1, "dealer_soft_17": "stand", "max_split_hands": 4},
        "dealer": {"cards": dealer},
        "players": hands,
        "discarded_cards": discarded,
    }


def request(state: dict[str, object], hand_id: str = "hand-1"):
    return client.post(
        "/api/analyze",
        json={
            "state": state,
            "options": {
                "method": "exact_hand_summaries",
                "target": {"seat": 4, "hand_id": hand_id},
            },
        },
    )


def assert_mass(outcomes: dict[str, float]) -> None:
    assert math.isclose(sum(outcomes.values()), 1.0, abs_tol=1e-12)


def test_two_hand_summary_targets_by_seat_and_hand_id() -> None:
    response = request(dense_split_state())

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "exact_hand_summaries"
    assert payload["target"] == {"seat": 4, "hand_id": "hand-1"}
    assert [item["target"]["hand_id"] for item in payload["hands"]] == [
        "hand-1",
        "hand-2",
    ]
    assert all(item["status"] == "complete" for item in payload["hands"])
    for item in payload["hands"]:
        assert_mass(item["outcomes"])


def test_four_resplit_hands_are_returned_in_reconstructed_order() -> None:
    payload = request(dense_split_state(4), "hand-3").json()

    assert [item["target"]["hand_id"] for item in payload["hands"]] == [
        "hand-1",
        "hand-2",
        "hand-3",
        "hand-4",
    ]
    for item in payload["hands"]:
        assert item["status"] == "complete"
        assert_mass(item["outcomes"])


def test_target_must_exist_at_the_specified_seat() -> None:
    wrong_seat = client.post(
        "/api/analyze",
        json={
            "state": dense_split_state(),
            "options": {
                "method": "exact_hand_summaries",
                "target": {"seat": 3, "hand_id": "hand-1"},
            },
        },
    )
    stale = request(dense_split_state(), "removed-parent")

    assert wrong_seat.status_code == 422
    assert wrong_seat.json()["error"]["code"] == "invalid_hand_target"
    assert stale.status_code == 422
    assert stale.json()["error"]["code"] == "invalid_hand_target"


def test_sibling_cards_remain_removed_from_one_shared_shoe() -> None:
    shared = request(dense_split_state()).json()["hands"][0]["outcomes"]
    without_sibling = dense_split_state()
    without_sibling["players"] = without_sibling["players"][:1]
    independent = request(without_sibling).json()["hands"][0]["outcomes"]

    assert shared == {"win": 0.5, "push": 0.0, "loss": 0.5}
    assert independent != shared
    assert math.isclose(independent["win"], 0.75, abs_tol=1e-12)


def test_independently_obvious_terminal_fixture_is_exact() -> None:
    payload = request(deterministic_split_state(), "left").json()

    assert payload["hands"][0]["outcomes"] == {"win": 1.0, "push": 0.0, "loss": 0.0}
    assert payload["hands"][1]["outcomes"] == {"win": 0.0, "push": 0.0, "loss": 1.0}


def test_value_only_and_unknown_observations_preserve_physical_semantics() -> None:
    state = deterministic_split_state()
    state["players"][1]["cards"] = [
        {"kind": "value", "value": "10"},
        {"kind": "value", "value": "7"},
    ]
    state["discarded_cards"] = [{"kind": "unknown"}]
    payload = request(state, "left").json()

    assert len(payload["hands"]) == 2
    assert all(item["status"] == "complete" for item in payload["hands"])
    assert all(item["state_summary"]["hidden_cards"] == 1 for item in payload["hands"])


def test_unknown_deck_split_returns_backend_model_summaries_per_hand() -> None:
    payload = request(deterministic_split_state(decks=None), "left").json()

    assert payload["model_uncertainty"] == ["deck_count"]
    assert len(payload["scenarios"]) == 8
    assert [item["target"]["hand_id"] for item in payload["deck_count_summaries"]] == [
        "left",
        "right",
    ]
    for summary in payload["deck_count_summaries"]:
        assert summary["status"] == "available"
        assert_mass(summary["outcomes"])


def test_selected_hand_action_forecast_contract_remains_explicit_and_non_prescriptive() -> None:
    state = deterministic_split_state()
    state["players"][1]["is_user"] = True
    response = client.post(
        "/api/analyze",
        json={
            "state": state,
            "options": {
                "method": "exact_action_forecast",
                "target": {"seat": 4, "hand_id": "right"},
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["target"] == {"seat": 4, "hand_id": "right"}
    assert set(payload["action_forecasts"]) == {
        "stand_now",
        "hit_once_then_stand",
        "double_one_card_then_stand",
        "surrender_now",
        "split_one_card_each_then_stand",
    }
    assert "recommend" not in str(payload).lower()
    assert "best_action" not in str(payload).lower()


def test_request_does_not_mutate_input_target_flags() -> None:
    state = dense_split_state()
    original = deepcopy(state)

    request(state)

    assert state == original
