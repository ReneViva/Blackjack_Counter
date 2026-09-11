from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def exact_micro_state() -> dict[str, object]:
    retained = {("5", "S"), ("10", "S")}
    player = {("10", "H"), ("K", "H")}
    dealer = {("6", "D"), ("10", "C")}
    discarded = [
        known(rank, suit)
        for rank in RANKS
        for suit in SUITS
        if (rank, suit) not in retained | player | dealer
    ]
    return {
        "rules": {"decks": 1, "dealer_soft_17": "stand"},
        "dealer": {"cards": [known("6", "D"), known("10", "C")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("10", "H"), known("K", "H")],
            }
        ],
        "discarded_cards": discarded,
    }


def request_for(state: dict[str, object]) -> dict[str, object]:
    return {"state": state, "options": {"method": "exact"}}


def test_exact_analysis_returns_hand_calculated_known_state_result() -> None:
    response = client.post("/api/analyze", json=request_for(exact_micro_state()))

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "exact"
    assert payload["state_summary"] == {
        "cards_remaining": 2,
        "known_cards": 50,
        "hidden_cards": 0,
    }
    assert payload["outcomes"] == {"win": 0.5, "push": 0.0, "loss": 0.5}
    assert sum(payload["outcomes"].values()) == 1.0
    assert payload["metadata"]["states_evaluated"] == 3
    assert payload["metadata"]["cache_hits"] == 0
    assert payload["metadata"]["cache_misses"] == 3
    assert payload["metadata"]["runtime_ms"] >= 0.0
    assert "confidence_interval" not in payload


def test_exact_analysis_is_deterministic_across_requests() -> None:
    first = client.post("/api/analyze", json=request_for(exact_micro_state())).json()
    second = client.post("/api/analyze", json=request_for(exact_micro_state())).json()

    assert first["outcomes"] == second["outcomes"]
    assert first["state_summary"] == second["state_summary"]
    assert first["metadata"]["states_evaluated"] == second["metadata"]["states_evaluated"]
    assert first["metadata"]["cache_hits"] == second["metadata"]["cache_hits"]


def test_exact_analysis_rejects_semantically_invalid_state() -> None:
    state = exact_micro_state()
    repeated = known("A", "S")
    state["dealer"] = {"cards": [repeated, repeated]}

    response = client.post("/api/analyze", json=request_for(state))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_state"


def test_exact_analysis_rejects_malformed_transport() -> None:
    response = client.post("/api/analyze", json={"state": {}})

    assert response.status_code == 422


def test_exact_analysis_defers_unknown_cards() -> None:
    state = exact_micro_state()
    state["dealer"] = {"cards": [known("6", "D"), {"kind": "unknown"}]}

    response = client.post("/api/analyze", json=request_for(state))

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "exact_analysis_requires_resolved_hidden_composition",
            "message": "Exact analysis requires every observed card identity to be resolved.",
            "field": None,
        }
    }


def test_exact_analysis_defers_unknown_deck_count() -> None:
    state = exact_micro_state()
    state["rules"] = {"decks": None, "dealer_soft_17": "stand"}

    response = client.post("/api/analyze", json=request_for(state))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "exact_analysis_requires_known_deck"


def test_exact_analysis_rejects_unmarked_user_target() -> None:
    state = exact_micro_state()
    state["players"] = []

    response = client.post("/api/analyze", json=request_for(state))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_state"


def test_exact_analysis_supports_frontend_cors() -> None:
    response = client.options(
        "/api/analyze",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_health_contract_remains_unchanged() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "blackjack-analysis-api"}
