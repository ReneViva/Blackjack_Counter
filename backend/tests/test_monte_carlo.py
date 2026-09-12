from dataclasses import replace
import random

import pytest
from fastapi.testclient import TestClient

from app.domain import DealerCheckResult, Rank
from app.engine import build_table_state
from app.main import app
from app.probability import ExactAnalysisError, sample_hidden_state, simulate_table
from app.schemas import TableStateSchema

from test_analysis_scenarios import terminal_state
from test_hidden_card_marginalization import hidden, known, state_with_available


client = TestClient(app)


def weighted_hidden_state():
    return state_with_available(
        dealer=[known("10", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("6", "S"), ("K", "S"), ("K", "D"), ("K", "C")},
    )


def test_fixed_seed_reproduces_counts_and_different_seed_changes_sequence() -> None:
    state = weighted_hidden_state()

    first = simulate_table(state, 200, seed=12345)
    second = simulate_table(state, 200, seed=12345)
    different = simulate_table(state, 200, seed=54321)

    assert first == second
    assert first.counts != different.counts


def test_counts_and_estimates_have_complete_probability_mass() -> None:
    result = simulate_table(weighted_hidden_state(), 500, seed=7)

    assert result.counts.total == 500
    assert result.outcomes.total == 1.0
    assert result.outcomes.win == result.counts.win / 500
    assert result.outcomes.push == result.counts.push / 500
    assert result.outcomes.loss == result.counts.loss / 500


def test_deterministic_outcome_is_one_for_every_trial() -> None:
    state = build_table_state(TableStateSchema.model_validate(terminal_state()))

    result = simulate_table(state, 100, seed=99)

    assert result.counts.win == 100
    assert result.outcomes.win == 1.0


def test_hidden_sampling_uses_multiplicity_weights_with_statistical_tolerance() -> None:
    result = simulate_table(weighted_hidden_state(), 5_000, seed=2026)

    assert abs(result.outcomes.win - 0.25) < 0.03
    assert abs(result.outcomes.push - 0.75) < 0.03


def test_hidden_sample_removes_selected_physical_card_without_replacement() -> None:
    state = weighted_hidden_state()

    branch = sample_hidden_state(state, random.Random(12))
    selected = branch.dealer_hand.cards[1]

    assert branch.shoe.exact_total == state.game_state.shoe.exact_total - 1
    assert branch.shoe.count(selected) == state.game_state.shoe.count(selected) - 1
    assert branch.shoe.unknown_removed_count == 0


def test_no_blackjack_conditioning_never_samples_excluded_hole() -> None:
    state = state_with_available(
        dealer=[known("A", "D"), hidden()],
        player=[known("10", "H"), known("K", "H")],
        available={("9", "S"), ("K", "S"), ("K", "D"), ("K", "C")},
        peek=True,
    )

    result = simulate_table(
        state,
        250,
        seed=44,
        dealer_check_result=DealerCheckResult.NO_BLACKJACK,
    )

    assert result.counts.push == 250
    assert result.outcomes.push == 1.0


def test_simulation_does_not_mutate_input() -> None:
    state = weighted_hidden_state()
    original = state

    simulate_table(state, 20, seed=1)

    assert state == original
    assert state.game_state.shoe.unknown_removed_count == 1


@pytest.mark.parametrize("simulations", [0, -1, True, 1_000_001])
def test_invalid_simulation_count_is_rejected(simulations) -> None:
    with pytest.raises(ExactAnalysisError) as caught:
        simulate_table(weighted_hidden_state(), simulations, seed=1)

    assert caught.value.code == "invalid_simulation_count"


def test_api_returns_monte_carlo_label_raw_counts_and_estimates() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(),
            "options": {
                "method": "monte_carlo",
                "simulations": 25,
                "seed": 123,
                "confidence_level": 0.95,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "monte_carlo"
    assert payload["simulations"] == 25
    assert payload["counts"] == {"win": 25, "push": 0, "loss": 0}
    assert payload["outcomes"]["win"]["estimate"] == 1.0
    assert payload["outcomes"]["push"]["estimate"] == 0.0
    assert payload["outcomes"]["loss"]["estimate"] == 0.0
    assert payload["confidence_level"] == 0.95
    assert payload["outcomes"]["win"]["ci_high"] == 1.0
    assert "states_evaluated" not in payload


@pytest.mark.parametrize("level", [0.9, 0.95, 0.99])
def test_api_supports_each_sampling_confidence_level(level: float) -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(),
            "options": {
                "method": "monte_carlo",
                "simulations": 10,
                "seed": 1,
                "confidence_level": level,
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["confidence_level"] == level


def test_monte_carlo_unknown_deck_remains_separate_scenarios() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(decks=None),
            "options": {
                "method": "monte_carlo",
                "simulations": 3,
                "seed": 4,
                "confidence_level": 0.9,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "monte_carlo"
    assert payload["aggregation"] == "none"
    assert len(payload["scenarios"]) == 8
    assert all(item["result"]["counts"]["win"] == 3 for item in payload["scenarios"])


@pytest.mark.parametrize("simulations", [0, True, 1_000_001])
def test_api_strictly_rejects_invalid_simulation_counts(simulations) -> None:
    response = client.post(
        "/api/analyze",
        json={
            "state": terminal_state(),
            "options": {"method": "monte_carlo", "simulations": simulations},
        },
    )

    assert response.status_code == 422
