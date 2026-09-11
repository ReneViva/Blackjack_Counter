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
