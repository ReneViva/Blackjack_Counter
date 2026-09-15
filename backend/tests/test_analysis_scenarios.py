from fastapi.testclient import TestClient

from app.main import app
from app.engine import build_table_state
from app.probability import analyze_exact_table, concrete_scenarios
from app.schemas import TableStateSchema

from test_analyze_api import exact_micro_state


client = TestClient(app)
RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def terminal_state(*, decks=1, dealer_soft_17="stand") -> dict[str, object]:
    return {
        "rules": {"decks": decks, "dealer_soft_17": dealer_soft_17},
        "dealer": {"cards": [known("10", "D"), known("9", "D")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("10", "H"), known("K", "H")],
            }
        ],
        "discarded_cards": [],
    }


def analyze(state: dict[str, object]):
    return client.post(
        "/api/analyze", json={"state": state, "options": {"method": "exact"}}
    )


def test_unknown_deck_returns_eight_separate_unaveraged_scenarios() -> None:
    response = analyze(terminal_state(decks=None))

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "exact"
    assert payload["model_uncertainty"] == ["deck_count"]
    assert payload["aggregation"] == "none"
    assert [item["assumptions"]["decks"] for item in payload["scenarios"]] == list(
        range(1, 9)
    )
    assert all(item["status"] == "complete" for item in payload["scenarios"])
    assert all(item["result"]["outcomes"]["win"] == 1.0 for item in payload["scenarios"])


def test_invalid_deck_scenario_is_labeled_instead_of_dropped() -> None:
    state = terminal_state(decks=None)
    state["discarded_cards"] = [known("A", "S"), known("A", "S")]

    payload = analyze(state).json()

    assert len(payload["scenarios"]) == 8
    assert payload["scenarios"][0]["assumptions"]["decks"] == 1
    assert payload["scenarios"][0]["status"] == "invalid"
    assert (
        payload["scenarios"][0]["error"]["code"]
        == "exact_card_multiplicity_exceeded"
    )
    assert all(item["status"] == "complete" for item in payload["scenarios"][1:])


def test_unknown_soft_17_returns_one_result_per_supported_value() -> None:
    visible = {("A", "D"), ("6", "D"), ("10", "H"), ("8", "H")}
    available = {("2", "S"), ("K", "S")}
    state = {
        "rules": {"decks": 1, "dealer_soft_17": None},
        "dealer": {"cards": [known("A", "D"), known("6", "D")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("10", "H"), known("8", "H")],
            }
        ],
        "discarded_cards": [
            known(rank, suit)
            for rank in RANKS
            for suit in SUITS
            if (rank, suit) not in visible | available
        ],
    }

    payload = analyze(state).json()

    assert payload["model_uncertainty"] == ["dealer_soft_17"]
    assert [item["assumptions"]["dealer_soft_17"] for item in payload["scenarios"]] == [
        "stand",
        "hit",
    ]
    assert payload["scenarios"][0]["result"]["outcomes"] == {
        "win": 1.0,
        "push": 0.0,
        "loss": 0.0,
    }
    assert payload["scenarios"][1]["result"]["outcomes"] == {
        "win": 0.5,
        "push": 0.0,
        "loss": 0.5,
    }


def test_unknown_deck_and_rule_form_cartesian_scenarios() -> None:
    payload = analyze(terminal_state(decks=None, dealer_soft_17=None)).json()

    assert payload["model_uncertainty"] == ["deck_count", "dealer_soft_17"]
    assert len(payload["scenarios"]) == 16
    assert payload["scenarios"][0]["assumptions"] == {
        "decks": 1,
        "dealer_soft_17": "stand",
    }


def test_deck_scenarios_can_produce_distinct_conditional_results() -> None:
    state = exact_micro_state()
    state["rules"] = {"decks": None, "dealer_soft_17": "stand"}
    plan = concrete_scenarios(TableStateSchema.model_validate(state))

    one_deck = analyze_exact_table(build_table_state(plan.scenarios[0].state))
    two_decks = analyze_exact_table(build_table_state(plan.scenarios[1].state))

    assert one_deck.outcomes != two_decks.outcomes
    assert one_deck.outcomes.win == 0.5


def test_scenario_results_are_deterministic_apart_from_runtime_diagnostics() -> None:
    first = analyze(terminal_state(decks=None)).json()
    second = analyze(terminal_state(decks=None)).json()

    assert [item["assumptions"] for item in first["scenarios"]] == [
        item["assumptions"] for item in second["scenarios"]
    ]
    assert [item["result"]["outcomes"] for item in first["scenarios"]] == [
        item["result"]["outcomes"] for item in second["scenarios"]
    ]


def test_concrete_model_retains_single_result_contract() -> None:
    payload = analyze(terminal_state()).json()

    assert payload["method"] == "exact"
    assert "scenarios" not in payload
    assert payload["outcomes"]["win"] == 1.0


def test_unknown_deck_excludes_models_with_insufficient_value_capacity() -> None:
    state = terminal_state(decks=None)
    state["dealer"] = {"cards": [known("9", "D"), known("8", "D")]}
    state["players"] = [
        {
            "seat": 1,
            "is_user": True,
            "cards": [known("9", "H"), known("8", "H")],
        }
    ]
    state["discarded_cards"] = [
        {"kind": "value", "value": "10"} for _ in range(17)
    ]

    payload = analyze(state).json()

    assert payload["scenarios"][0]["status"] == "invalid"
    assert payload["scenarios"][0]["error"]["code"] == "value_class_capacity_exceeded"
    assert all(item["status"] == "complete" for item in payload["scenarios"][1:])
    summary = payload["deck_count_summaries"][0]
    assert summary["included_deck_counts"] == list(range(2, 9))
    assert summary["excluded_deck_counts"][0]["deck_count"] == 1
