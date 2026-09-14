import math

from fastapi.testclient import TestClient

from app.main import app
from app.probability import OutcomeDistribution, summarize_outcomes


client = TestClient(app)


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def state(
    *,
    decks: int | None = None,
    soft_17: str | None = "stand",
    player_cards: list[dict[str, str]] | None = None,
    discarded_cards: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    return {
        "rules": {
            "decks": decks,
            "dealer_soft_17": soft_17,
            "surrender": "late",
        },
        "dealer": {"cards": [known("6", "D"), known("10", "C")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "hand_id": "seat-1-hand-1",
                "cards": player_cards
                or [known("10", "H"), known("K", "H")],
            }
        ],
        "discarded_cards": discarded_cards or [],
    }


def request(
    table_state: dict[str, object], *, action_forecast: bool = False
) -> dict[str, object]:
    options: dict[str, object] = {"method": "exact"}
    if action_forecast:
        options = {
            "method": "exact_action_forecast",
            "target": {"seat": 1, "hand_id": "seat-1-hand-1"},
        }
    response = client.post(
        "/api/analyze", json={"state": table_state, "options": options}
    )
    assert response.status_code == 200
    return response.json()


def expected_golden(decks: int) -> dict[str, float]:
    remaining = 52 * decks - 4
    return {
        "win": (44 * decks - 4) / remaining,
        "push": 4 * decks / remaining,
        "loss": 4 * decks / remaining,
    }


def assert_mass(outcomes: dict[str, float]) -> None:
    assert all(0.0 <= outcomes[key] <= 1.0 for key in ("win", "push", "loss"))
    assert math.isclose(sum(outcomes.values()), 1.0, abs_tol=1e-12)


def test_stable_summary_math_uses_mean_and_envelope() -> None:
    summary = summarize_outcomes(
        [
            OutcomeDistribution(win=0.25, push=0.25, loss=0.5),
            OutcomeDistribution(win=0.5, push=0.125, loss=0.375),
        ]
    )

    assert summary.outcomes == OutcomeDistribution(
        win=0.375, push=0.1875, loss=0.4375
    )
    assert summary.win_range.minimum == 0.25
    assert summary.win_range.maximum == 0.5
    assert summary.push_range.minimum == 0.125
    assert summary.push_range.maximum == 0.25


def test_unknown_deck_golden_scenarios_and_uniform_summary() -> None:
    original = state()
    payload = request(original)

    assert payload["model_uncertainty"] == ["deck_count"]
    assert payload["aggregation"] == "none"
    assert [item["assumptions"]["decks"] for item in payload["scenarios"]] == list(
        range(1, 9)
    )
    assert len(payload["deck_count_summaries"]) == 1
    for scenario in payload["scenarios"]:
        decks = scenario["assumptions"]["decks"]
        assert scenario["status"] == "complete"
        assert scenario["result"]["state_summary"]["cards_remaining"] == 52 * decks - 4
        for outcome, expected_value in expected_golden(decks).items():
            assert math.isclose(
                scenario["result"]["outcomes"][outcome],
                expected_value,
                abs_tol=1e-15,
            )
        assert_mass(scenario["result"]["outcomes"])

    summary = payload["deck_count_summaries"][0]
    expected = {
        outcome: math.fsum(expected_golden(decks)[outcome] for decks in range(1, 9))
        / 8
        for outcome in ("win", "push", "loss")
    }
    assert summary["method"] == "uniform_valid_deck_count_mean"
    assert summary["assumption"] == "equal_weight_valid_deck_counts"
    assert summary["candidate_deck_counts"] == list(range(1, 9))
    assert summary["included_deck_counts"] == list(range(1, 9))
    assert summary["excluded_deck_counts"] == []
    assert summary["outcomes"] == expected
    assert_mass(summary["outcomes"])
    for outcome in ("win", "push", "loss"):
        values = [expected_golden(decks)[outcome] for decks in range(1, 9)]
        assert math.isclose(
            summary["ranges"][outcome]["minimum"], min(values), abs_tol=1e-15
        )
        assert math.isclose(
            summary["ranges"][outcome]["maximum"], max(values), abs_tol=1e-15
        )
    assert "confidence" not in str(summary).lower()
    assert original["rules"]["decks"] is None


def test_invalid_small_model_is_excluded_not_zeroed() -> None:
    payload = request(
        state(discarded_cards=[known("A", "S"), known("A", "S")])
    )

    first = payload["scenarios"][0]
    summary = payload["deck_count_summaries"][0]
    assert first["status"] == "invalid"
    assert first["result"] is None
    assert first["error"]["code"] == "exact_card_multiplicity_exceeded"
    assert summary["included_deck_counts"] == list(range(2, 9))
    assert summary["excluded_deck_counts"][0]["deck_count"] == 1
    assert (
        summary["excluded_deck_counts"][0]["code"]
        == "exact_card_multiplicity_exceeded"
    )
    assert all(item["status"] == "complete" for item in payload["scenarios"][1:])


def test_no_valid_deck_model_is_structured_unavailable() -> None:
    payload = request(state(discarded_cards=[known("A", "S")] * 9))

    assert all(item["status"] == "invalid" for item in payload["scenarios"])
    summary = payload["deck_count_summaries"][0]
    assert summary["status"] == "unavailable"
    assert summary["included_deck_counts"] == []
    assert len(summary["excluded_deck_counts"]) == 8
    assert summary["outcomes"] is None
    assert summary["ranges"] is None
    assert summary["error"]["code"] == "no_valid_deck_models"


def test_known_deck_bypasses_model_summary() -> None:
    payload = request(state(decks=6))

    assert payload["method"] == "exact"
    assert "scenarios" not in payload
    assert "deck_count_summaries" not in payload


def test_unknown_soft_17_keeps_two_deck_summary_groups_separate() -> None:
    payload = request(state(soft_17=None))

    assert len(payload["scenarios"]) == 16
    summaries = payload["deck_count_summaries"]
    assert len(summaries) == 2
    assert {item["dealer_soft_17"] for item in summaries} == {"stand", "hit"}
    assert all(item["included_deck_counts"] == list(range(1, 9)) for item in summaries)
    assert all(len(item["candidate_deck_counts"]) == 8 for item in summaries)


def test_action_summaries_preserve_probability_terminal_and_split_shapes() -> None:
    ordinary = request(state(), action_forecast=True)
    forecasts = ordinary["deck_count_summaries"][0]["action_forecasts"]
    expected = {
        outcome: math.fsum(expected_golden(decks)[outcome] for decks in range(1, 9))
        / 8
        for outcome in ("win", "push", "loss")
    }

    for action in ("stand_now", "hit_once_then_stand", "double_one_card_then_stand"):
        assert forecasts[action]["status"] == "available"
        assert_mass(forecasts[action]["outcomes"])
        assert forecasts[action]["ranges"] is not None
    for outcome, expected_value in expected.items():
        assert math.isclose(
            forecasts["stand_now"]["outcomes"][outcome],
            expected_value,
            abs_tol=1e-15,
        )
    for action in ("hit_once_then_stand", "double_one_card_then_stand"):
        for outcome in ("win", "push", "loss"):
            scenario_values = [
                item["result"]["action_forecasts"][action]["outcomes"][outcome]
                for item in ordinary["scenarios"]
            ]
            assert math.isclose(
                forecasts[action]["outcomes"][outcome],
                math.fsum(scenario_values) / 8,
                abs_tol=1e-15,
            )
    assert (
        forecasts["double_one_card_then_stand"]["outcomes"]
        == forecasts["hit_once_then_stand"]["outcomes"]
    )
    assert forecasts["surrender_now"]["terminal"] == "surrendered"
    assert forecasts["surrender_now"]["outcomes"] is None

    split = request(
        state(player_cards=[known("8", "H"), known("8", "S")]),
        action_forecast=True,
    )
    split_summary = split["deck_count_summaries"][0]["action_forecasts"][
        "split_one_card_each_then_stand"
    ]
    assert split_summary["status"] == "available"
    assert_mass(split_summary["child_hand_1"]["outcomes"])
    assert_mass(split_summary["child_hand_2"]["outcomes"])
    for child in ("child_hand_1", "child_hand_2"):
        for outcome in ("win", "push", "loss"):
            expected_child = math.fsum(
                item["result"]["action_forecasts"][
                    "split_one_card_each_then_stand"
                ][child][outcome]
                for item in split["scenarios"]
            ) / 8
            assert math.isclose(
                split_summary[child]["outcomes"][outcome],
                expected_child,
                abs_tol=1e-15,
            )
    assert split_summary["outcomes"] is None
    assert "combined" not in split_summary


def test_action_invalid_model_does_not_remove_valid_deck_scenarios() -> None:
    payload = request(
        state(discarded_cards=[known("A", "S"), known("A", "S")]),
        action_forecast=True,
    )

    assert payload["scenarios"][0]["status"] == "invalid"
    assert payload["scenarios"][0]["result"] is None
    assert all(item["status"] == "complete" for item in payload["scenarios"][1:])
    summary = payload["deck_count_summaries"][0]
    assert summary["included_deck_counts"] == list(range(2, 9))
    assert summary["status"] == "available"
    assert summary["action_forecasts"]["stand_now"]["status"] == "available"


def test_action_unknown_rule_groups_do_not_cross_average() -> None:
    payload = request(state(soft_17=None), action_forecast=True)

    assert len(payload["scenarios"]) == 16
    assert len(payload["deck_count_summaries"]) == 2
    assert {item["dealer_soft_17"] for item in payload["deck_count_summaries"]} == {
        "stand",
        "hit",
    }
    assert all(
        item["included_deck_counts"] == list(range(1, 9))
        for item in payload["deck_count_summaries"]
    )


def test_unknown_deck_action_scenarios_are_deterministic() -> None:
    first = request(state(), action_forecast=True)
    second = request(state(), action_forecast=True)

    def without_runtime(payload: dict[str, object]) -> list[object]:
        items = [
            {
                "assumptions": item["assumptions"],
                "status": item["status"],
                "forecasts": item["result"]["action_forecasts"],
            }
            for item in payload["scenarios"]
        ]
        for item in items:
            for action in item["forecasts"].values():
                if action.get("metadata"):
                    action["metadata"].pop("runtime_ms")
        return items
    assert without_runtime(first) == without_runtime(second)


def test_scenario_response_documents_independent_exact_resource_caps() -> None:
    exact = request(state())
    action = request(state(), action_forecast=True)

    for payload in (exact, action):
        assert payload["resource_limit_scope"] == "per_scenario"
        assert payload["exact_state_limit_per_scenario"] == 2_000_000
