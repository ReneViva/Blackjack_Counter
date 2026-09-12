import json

from fastapi.testclient import TestClient

from app.main import app
from app.probability import analyze_exact_table, compare_table, simulate_table

from test_analysis_scenarios import terminal_state
from test_monte_carlo import weighted_hidden_state


client = TestClient(app)


def test_same_model_comparison_preserves_both_engine_results_and_error_math() -> None:
    state = weighted_hidden_state()
    exact = analyze_exact_table(state)
    monte_carlo = simulate_table(state, 2_000, seed=321)

    compared = compare_table(
        state, 2_000, seed=321, confidence_level=0.95
    )

    assert compared.exact == exact
    assert compared.monte_carlo == monte_carlo
    assert compared.win is not None
    expected_signed = monte_carlo.outcomes.win - exact.outcomes.win
    assert compared.win.signed_error == expected_signed
    assert compared.win.absolute_error == abs(expected_signed)
    assert compared.win.exact_probability == exact.outcomes.win
    assert compared.win.monte_carlo_estimate == monte_carlo.outcomes.win
    assert exact.outcomes.total == 1.0
    assert monte_carlo.outcomes.total == 1.0


def test_comparison_is_seed_deterministic_for_hidden_marginalization() -> None:
    state = weighted_hidden_state()

    first = compare_table(state, 500, seed=77)
    second = compare_table(state, 500, seed=77)

    assert first == second


def test_exact_limit_returns_structured_unavailable_comparison_without_metrics() -> None:
    result = compare_table(
        weighted_hidden_state(), 25, seed=5, max_exact_states=1
    )

    assert result.exact is None
    assert result.exact_error is not None
    assert result.exact_error.code == "exact_computation_limit"
    assert result.monte_carlo.counts.total == 25
    assert result.win is None
    assert result.push is None
    assert result.loss is None


def test_api_compare_distinguishes_exact_estimate_ci_and_errors() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(),
            "options": {
                "method": "compare",
                "simulations": 50,
                "seed": 222,
                "confidence_level": 0.99,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "compare"
    assert payload["status"] == "complete"
    assert payload["exact"]["outcomes"]["win"] == 1.0
    assert "confidence_interval" not in payload["exact"]
    assert payload["monte_carlo"]["outcomes"]["win"]["estimate"] == 1.0
    comparison = payload["comparison"]["win"]
    assert comparison["exact_probability"] == 1.0
    assert comparison["monte_carlo_estimate"] == 1.0
    assert comparison["signed_error"] == 0.0
    assert comparison["absolute_error"] == 0.0
    assert comparison["exact_in_confidence_interval"] is True
    assert "recommend" not in json.dumps(payload).lower()


def test_compare_scenarios_keep_concrete_model_identity() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(decks=None),
            "options": {
                "method": "compare",
                "simulations": 10,
                "seed": 1,
                "confidence_level": 0.9,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "compare"
    assert payload["model_uncertainty"] == ["deck_count"]
    assert payload["aggregation"] == "none"
    assert [item["assumptions"]["decks"] for item in payload["scenarios"]] == list(
        range(1, 9)
    )
    assert all(item["result"]["status"] == "complete" for item in payload["scenarios"])
