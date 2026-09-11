from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_frontend_state_contract_reaches_reconstruction_boundary() -> None:
    response = client.post(
        "/api/validate",
        json={
            "rules": {"decks": 2, "dealer_soft_17": "hit"},
            "dealer": {
                "cards": [
                    {"kind": "known", "rank": "K", "suit": "H"},
                    {"kind": "unknown"},
                ]
            },
            "players": [
                {"seat": 1, "is_user": False, "cards": []},
                {
                    "seat": 3,
                    "is_user": True,
                    "cards": [{"kind": "known", "rank": "A", "suit": "S"}],
                },
            ],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"valid": True, "errors": [], "warnings": []}


def test_validate_route_rejects_malformed_transport() -> None:
    response = client.post(
        "/api/validate",
        json={
            "rules": {"decks": 6, "dealer_soft_17": "stand"},
            "dealer": {
                "cards": [{"kind": "known", "rank": "T", "suit": "H"}]
            },
            "players": [],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 422


def test_validate_route_returns_structured_semantic_errors() -> None:
    repeated = {"kind": "known", "rank": "A", "suit": "S"}
    response = client.post(
        "/api/validate",
        json={
            "rules": {"decks": 1, "dealer_soft_17": "stand"},
            "dealer": {"cards": [repeated, repeated]},
            "players": [],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "valid": False,
        "errors": [
            {
                "code": "exact_card_multiplicity_exceeded",
                "message": "Observed 2 copies of AS; a 1-deck shoe contains 1.",
                "field": "cards",
            }
        ],
        "warnings": [],
    }


def test_validate_route_preserves_unknown_deck_as_warning() -> None:
    response = client.post(
        "/api/validate",
        json={
            "rules": {"decks": None, "dealer_soft_17": "stand"},
            "dealer": {"cards": [{"kind": "unknown"}]},
            "players": [],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "errors": [],
        "warnings": [
            {
                "code": "deck_count_unknown",
                "message": (
                    "Physical shoe limits cannot be verified without a deck count."
                ),
                "field": "rules.decks",
            }
        ],
    }


def test_validate_route_allows_frontend_post_cors_preflight() -> None:
    response = client.options(
        "/api/validate",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_validate_route_accepts_and_reconstructs_extended_rules() -> None:
    response = client.post(
        "/api/validate",
        json={
            "rules": {
                "decks": 6,
                "dealer_soft_17": "hit",
                "splitting_enabled": True,
                "max_split_hands": 3,
                "resplit_aces": True,
                "hit_split_aces": True,
                "blackjack_after_split": True,
                "doubling_enabled": False,
                "double_after_split": False,
                "surrender": "late",
                "dealer_second_card": "hole_card",
                "dealer_blackjack_check": "peek",
            },
            "dealer": {"cards": []},
            "players": [],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"valid": True, "errors": [], "warnings": []}


def test_validate_route_rejects_no_hole_card_with_peek() -> None:
    response = client.post(
        "/api/validate",
        json={
            "rules": {
                "decks": 1,
                "dealer_soft_17": "stand",
                "dealer_second_card": "no_hole_card",
                "dealer_blackjack_check": "peek",
            },
            "dealer": {"cards": []},
            "players": [],
            "discarded_cards": [],
        },
    )

    assert response.status_code == 422


def test_validate_route_rejects_coerced_rule_scalars() -> None:
    for field, value in (
        ("splitting_enabled", 1),
        ("max_split_hands", True),
        ("doubling_enabled", "true"),
    ):
        response = client.post(
            "/api/validate",
            json={
                "rules": {
                    "decks": 1,
                    "dealer_soft_17": "stand",
                    field: value,
                },
                "dealer": {"cards": []},
                "players": [],
                "discarded_cards": [],
            },
        )
        assert response.status_code == 422
