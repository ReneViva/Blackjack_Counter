from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_documented_contract() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "status": "ok",
        "service": "blackjack-analysis-api",
    }


def test_health_allows_vite_development_origin() -> None:
    origin = "http://127.0.0.1:5173"

    response = client.get("/api/health", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers


def test_health_does_not_allow_unrelated_origin() -> None:
    response = client.get(
        "/api/health",
        headers={"Origin": "https://unrelated.example"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
