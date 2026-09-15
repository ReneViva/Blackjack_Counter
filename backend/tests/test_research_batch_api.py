import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.research import SOURCE_ID, SOURCE_SHA256


client = TestClient(app)
RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def state(*, decks=1) -> dict[str, object]:
    return {
        "rules": {"decks": decks, "dealer_soft_17": "stand"},
        "dealer": {"cards": [known("10", "D"), known("6", "D")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("10", "H"), known("K", "H")],
            }
        ],
        "discarded_cards": [],
    }


def request(**changes) -> dict[str, object]:
    payload: dict[str, object] = {
        "state": state(),
        "definition_ids": ["wong_halves", "zen_count", "omega_ii"],
        "case_count": 3,
        "removed_cards_per_case": 6,
        "seed": 12345,
        "include_ace_information": True,
    }
    payload.update(changes)
    return payload


def test_batch_contract_provenance_metrics_and_probability_mass() -> None:
    response = client.post("/api/research/batch", json=request())

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "research_batch"
    assert payload["version"] == "1"
    assert payload["requested_case_count"] == payload["completed_case_count"] == 3
    assert payload["definition_ids"] == ["wong_halves", "zen_count", "omega_ii"]
    assert payload["source"]["source_id"] == SOURCE_ID
    assert payload["source"]["sha256"] == SOURCE_SHA256
    assert len(payload["metrics"]) == 6
    assert {metric["target"] for metric in payload["metrics"]} == {
        "exact_win_probability",
        "exact_outcome_balance",
    }
    for case_payload in payload["cases"]:
        assert len(case_payload["sampled_removed_ranks"]) == 6
        assert len(case_payload["research_results"]) == 3
        if case_payload["exact_reference_status"] == "available":
            outcomes = case_payload["exact_reference"]["outcomes"]
            assert sum(outcomes.values()) == pytest.approx(1.0, abs=1e-10)
            assert -1.0 <= case_payload["exact_outcome_balance"] <= 1.0


def test_same_request_and_seed_has_identical_transport() -> None:
    first = client.post("/api/research/batch", json=request()).json()
    second = client.post("/api/research/batch", json=request()).json()

    assert first == second


@pytest.mark.parametrize(
    "field,value",
    (
        ("case_count", 0),
        ("case_count", 1),
        ("case_count", 51),
        ("case_count", True),
        ("removed_cards_per_case", -1),
        ("removed_cards_per_case", 21),
        ("removed_cards_per_case", False),
        ("seed", -1),
        ("seed", 9_223_372_036_854_775_808),
        ("seed", True),
    ),
)
def test_numeric_limits_are_strictly_rejected(field: str, value) -> None:
    response = client.post("/api/research/batch", json=request(**{field: value}))

    assert response.status_code == 422


def test_seed_is_required() -> None:
    payload = request()
    del payload["seed"]

    assert client.post("/api/research/batch", json=payload).status_code == 422


@pytest.mark.parametrize("definition", ("ace_information", "missing"))
def test_non_primary_definition_is_rejected(definition: str) -> None:
    response = client.post(
        "/api/research/batch", json=request(definition_ids=[definition])
    )

    assert response.status_code == 422


def test_duplicate_definition_is_rejected() -> None:
    response = client.post(
        "/api/research/batch",
        json=request(definition_ids=["zen_count", "zen_count"]),
    )

    assert response.status_code == 422


def test_unknown_deck_is_rejected_with_structured_error() -> None:
    response = client.post("/api/research/batch", json=request(state=state(decks=None)))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "batch_requires_concrete_model"


def test_unknown_card_is_rejected_with_structured_error() -> None:
    unknown_state = state()
    unknown_state["discarded_cards"] = [{"kind": "unknown"}]
    response = client.post("/api/research/batch", json=request(state=unknown_state))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "batch_requires_resolved_composition"


def test_insufficient_remaining_cards_are_rejected_with_structured_error() -> None:
    limited_state = state()
    active = {("10", "D"), ("6", "D"), ("10", "H"), ("K", "H")}
    retained = {("A", "S")}
    limited_state["discarded_cards"] = [
        known(rank, suit)
        for rank in RANKS
        for suit in SUITS
        if (rank, suit) not in active | retained
    ]
    response = client.post(
        "/api/research/batch",
        json=request(state=limited_state, removed_cards_per_case=2),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "insufficient_remaining_cards"


def test_response_contains_no_recommendation_or_wager_contract() -> None:
    response_text = client.post(
        "/api/research/batch", json=request(case_count=2)
    ).text.lower()

    assert "wager" not in response_text
    assert "recommend" not in response_text
    assert '"rank"' not in response_text


def test_batch_route_supports_frontend_cors() -> None:
    response = client.options(
        "/api/research/batch",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
