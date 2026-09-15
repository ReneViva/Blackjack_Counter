import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.research import SOURCE_ID, SOURCE_SHA256


client = TestClient(app)

RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def research_state() -> dict[str, object]:
    return {
        "rules": {"decks": 1, "dealer_soft_17": "stand"},
        "dealer": {"cards": [known("2", "S")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("A", "H")],
            }
        ],
        "discarded_cards": [],
    }


def request_for(
    definition_ids: list[str],
    *,
    state: dict[str, object] | None = None,
    include_ace_information: bool = False,
    include_exact_reference: bool = False,
) -> dict[str, object]:
    return {
        "state": state or research_state(),
        "options": {
            "primary_definition_ids": definition_ids,
            "include_ace_information": include_ace_information,
            "include_exact_reference": include_exact_reference,
        },
    }


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


def test_each_approved_primary_definition_is_selectable() -> None:
    expected = {
        "hi_lo": 0.0,
        "wong_halves": -0.5,
        "zen_count": 0.0,
        "omega_ii": 1.0,
    }
    for definition_id, expected_score in expected.items():
        response = client.post(
            "/api/research/compare", json=request_for([definition_id])
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["method"] == "research_comparison"
        assert payload["scores"][0]["definition"]["identifier"] == definition_id
        assert payload["scores"][0]["raw_score"] == expected_score
        assert payload["scores"][0]["complete"] is True
        assert payload["exact_reference"] is None


def test_multiple_systems_preserve_order_and_distinct_scores() -> None:
    response = client.post(
        "/api/research/compare",
        json=request_for(["hi_lo", "omega_ii", "wong_halves", "zen_count"]),
    )

    assert response.status_code == 200
    scores = response.json()["scores"]
    assert [item["definition"]["identifier"] for item in scores] == [
        "hi_lo",
        "omega_ii",
        "wong_halves",
        "zen_count",
    ]
    assert [item["raw_score"] for item in scores] == [0.0, 1.0, -0.5, 0.0]


def test_fractional_source_scale_survives_api_transport() -> None:
    state = research_state()
    state["dealer"] = {"cards": [known("2", "S")]}
    state["players"] = []
    response = client.post(
        "/api/research/compare",
        json=request_for(["wong_halves"], state=state),
    )

    assert response.status_code == 200
    score = response.json()["scores"][0]
    assert score["raw_score"] == 0.5
    assert score["raw_score_fraction"] == "1/2"
    assert "probability" not in score
    assert "advantage" not in score
    assert "confidence" not in score


def test_hi_lo_definition_transport_is_source_backed_and_canonical() -> None:
    response = client.post(
        "/api/research/compare", json=request_for(["hi_lo"])
    )

    assert response.status_code == 200
    definition = response.json()["scores"][0]["definition"]
    assert definition["canonical_tags"] == [
        {"card_value": rank, "tag_fraction": str(tag), "tag_decimal": float(tag)}
        for rank, tag in zip(
            RANKS,
            (-1, 1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1),
            strict=True,
        )
    ]
    assert definition["published_metrics"] == {
        "kind": "published_static_metadata",
        "pe": 0.51,
        "bc": 0.97,
        "ic": 0.76,
    }
    assert definition["balanced"] is True
    assert definition["level"] == 1


def test_source_and_published_metrics_are_descriptive_metadata() -> None:
    response = client.post(
        "/api/research/compare", json=request_for(["zen_count"])
    )

    definition = response.json()["scores"][0]["definition"]
    assert definition["source"]["source_id"] == SOURCE_ID
    assert definition["source"]["sha256"] == SOURCE_SHA256
    assert definition["source"]["local_path"] == (
        "research/sources/approved-counting-systems.md"
    )
    assert definition["source"]["locator"]
    assert definition["published_metrics"] == {
        "kind": "published_static_metadata",
        "pe": 0.63,
        "bc": 0.96,
        "ic": 0.85,
    }


def test_unknown_card_reports_partial_raw_score_without_guessing() -> None:
    state = research_state()
    state["discarded_cards"] = [{"kind": "unknown"}]
    response = client.post(
        "/api/research/compare",
        json=request_for(["wong_halves"], state=state),
    )

    assert response.status_code == 200
    score = response.json()["scores"][0]
    assert score["raw_score"] == -0.5
    assert score["raw_score_fraction"] == "-1/2"
    assert score["observed_known_cards"] == 2
    assert score["unresolved_unknown_cards"] == 1
    assert score["complete"] is False


def test_ace_information_is_separate_and_does_not_change_raw_score() -> None:
    without_auxiliary = client.post(
        "/api/research/compare",
        json=request_for(["omega_ii"]),
    ).json()["scores"][0]
    with_auxiliary = client.post(
        "/api/research/compare",
        json=request_for(["omega_ii"], include_ace_information=True),
    ).json()["scores"][0]

    assert with_auxiliary["raw_score"] == without_auxiliary["raw_score"] == 1.0
    assert without_auxiliary["ace_information"] is None
    assert with_auxiliary["ace_information"] == {
        "feature_id": "ace_information",
        "label": "Ace Information",
        "source_id": SOURCE_ID,
        "associated_definition_id": "omega_ii",
        "primary_ace_classification": "ace_neutral",
        "known_aces_observed": 1,
        "exact_aces_remaining": 3,
        "complete": True,
    }


def test_unknown_ace_inventory_is_incomplete_without_affecting_score() -> None:
    state = research_state()
    state["discarded_cards"] = [{"kind": "unknown"}]
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["zen_count"], state=state, include_ace_information=True
        ),
    )

    score = response.json()["scores"][0]
    assert score["raw_score"] == 0.0
    assert score["complete"] is False
    assert score["ace_information"]["exact_aces_remaining"] is None
    assert score["ace_information"]["complete"] is False


@pytest.mark.parametrize("definition_id", ("ace_information", "missing"))
def test_non_primary_or_unsupported_definition_is_rejected(
    definition_id: str,
) -> None:
    response = client.post(
        "/api/research/compare", json=request_for([definition_id])
    )

    assert response.status_code == 422


def test_duplicate_primary_definition_is_rejected() -> None:
    response = client.post(
        "/api/research/compare",
        json=request_for(["zen_count", "zen_count"]),
    )

    assert response.status_code == 422


def test_exact_reference_remains_separate_from_research_score() -> None:
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["wong_halves"],
            state=exact_micro_state(),
            include_exact_reference=True,
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["exact_reference"] == {
        "method": "exact",
        "status": "complete",
        "outcomes": {"win": 0.5, "push": 0.0, "loss": 0.5},
        "error": None,
    }
    assert "outcomes" not in payload["scores"][0]
    assert "raw_score" not in payload["exact_reference"]


def test_unknown_deck_preserves_scenarios_and_adds_valid_model_summary() -> None:
    state = {
        "rules": {"decks": None, "dealer_soft_17": "stand"},
        "dealer": {"cards": [known("6", "S")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [
                    known("K", "H"),
                    known("Q", "D"),
                    known("2", "C"),
                ],
            }
        ],
        "discarded_cards": [],
    }
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["omega_ii"], state=state, include_exact_reference=True
        ),
    )

    assert response.status_code == 200
    exact = response.json()["exact_reference"]
    assert exact["model_uncertainty"] == ["deck_count"]
    assert exact["aggregation"] == "none"
    assert exact["resource_limit_scope"] == "per_scenario"
    assert exact["exact_state_limit_per_scenario"] == 2_000_000
    assert len(exact["scenarios"]) == 8
    assert all(
        item["reference"]["status"] == "complete"
        for item in exact["scenarios"]
    )
    assert exact["deck_count_summaries"][0]["included_deck_counts"] == list(
        range(1, 9)
    )
    assert exact["deck_count_summaries"][0]["excluded_deck_counts"] == []
    assert exact["deck_count_summaries"][0]["status"] == "available"


def test_unknown_deck_reference_excludes_impossible_small_model_honestly() -> None:
    repeated = known("A", "S")
    state = {
        "rules": {"decks": None, "dealer_soft_17": "stand"},
        "dealer": {"cards": [known("6", "D"), known("10", "H")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [repeated, repeated],
            }
        ],
        "discarded_cards": [],
    }
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["wong_halves", "zen_count", "omega_ii"],
            state=state,
            include_exact_reference=True,
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    reference = payload["exact_reference"]
    assert [score["raw_score_fraction"] for score in payload["scores"]] == [
        "-2",
        "-2",
        "0",
    ]
    one_deck = reference["scenarios"][0]
    assert one_deck["status"] == "invalid"
    assert one_deck["reference"]["outcomes"] is None
    assert one_deck["reference"]["error"]["code"] == (
        "exact_card_multiplicity_exceeded"
    )
    summary = reference["deck_count_summaries"][0]
    assert summary["included_deck_counts"] == [2, 3, 4, 5, 6, 7, 8]
    assert summary["excluded_deck_counts"][0]["deck_count"] == 1
    assert summary["excluded_deck_counts"][0]["code"] == (
        "exact_card_multiplicity_exceeded"
    )
    assert summary["outcomes"] != {"win": 0.0, "push": 0.0, "loss": 0.0}


def test_all_systems_share_one_exact_physical_reference() -> None:
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["wong_halves", "zen_count", "omega_ii"],
            state=exact_micro_state(),
            include_exact_reference=True,
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["exact_reference"]["outcomes"] == {
        "win": 0.5,
        "push": 0.0,
        "loss": 0.5,
    }
    assert len(payload["scores"]) == 3
    assert all("outcomes" not in score for score in payload["scores"])
    assert len({score["raw_score_fraction"] for score in payload["scores"]}) > 1


def test_published_metrics_are_static_across_current_table_states() -> None:
    first = client.post(
        "/api/research/compare", json=request_for(["omega_ii"])
    ).json()["scores"][0]["definition"]["published_metrics"]
    second = client.post(
        "/api/research/compare",
        json=request_for(["omega_ii"], state=exact_micro_state()),
    ).json()["scores"][0]["definition"]["published_metrics"]

    assert first == second == {
        "kind": "published_static_metadata",
        "pe": 0.67,
        "bc": 0.92,
        "ic": 0.85,
    }


def test_unknown_soft_17_keeps_two_separate_physical_model_families() -> None:
    state = {
        "rules": {"decks": None, "dealer_soft_17": None},
        "dealer": {"cards": [known("6", "S")]},
        "players": [
            {
                "seat": 1,
                "is_user": True,
                "cards": [known("K", "H"), known("Q", "D"), known("2", "C")],
            }
        ],
        "discarded_cards": [],
    }
    response = client.post(
        "/api/research/compare",
        json=request_for(
            ["zen_count"], state=state, include_exact_reference=True
        ),
    )

    assert response.status_code == 200
    reference = response.json()["exact_reference"]
    assert len(reference["scenarios"]) == 16
    assert len(reference["deck_count_summaries"]) == 2
    assert {
        summary["dealer_soft_17"]
        for summary in reference["deck_count_summaries"]
    } == {"stand", "hit"}
    assert all(
        summary["candidate_deck_counts"] == list(range(1, 9))
        for summary in reference["deck_count_summaries"]
    )
    assert "outcomes" not in reference


def test_semantically_invalid_state_is_rejected() -> None:
    state = research_state()
    repeated = known("A", "S")
    state["dealer"] = {"cards": [repeated, repeated]}
    response = client.post(
        "/api/research/compare", json=request_for(["zen_count"], state=state)
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_state"


def test_malformed_transport_is_rejected() -> None:
    response = client.post("/api/research/compare", json={"state": {}})

    assert response.status_code == 422


def test_research_route_supports_frontend_cors() -> None:
    response = client.options(
        "/api/research/compare",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://127.0.0.1:5173"
    )


def test_health_contract_remains_unchanged() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "blackjack-analysis-api"}
