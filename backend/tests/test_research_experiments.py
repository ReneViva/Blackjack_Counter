from collections import Counter
from dataclasses import replace
from fractions import Fraction

import pytest

from app.domain import Rank
from app.engine import build_table_state, validate_table_state
from app.probability import ExactAnalysisError, analyze_exact_table
from app.research import (
    APPROVED_PRIMARY_DEFINITIONS,
    ExperimentValidationError,
    generate_batch_experiment,
    get_primary_definition,
    remaining_rank_counts,
    score_known_ranks,
    shoe_after_rank_removals,
    table_observations,
)
from app.schemas import TableStateSchema


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def base_payload() -> TableStateSchema:
    return TableStateSchema.model_validate(
        {
            "rules": {"decks": 1, "dealer_soft_17": "stand"},
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
    )


def generate(*, seed: int = 12345, cases: int = 5, removed: int = 6):
    return generate_batch_experiment(
        build_table_state(base_payload()),
        APPROVED_PRIMARY_DEFINITIONS,
        case_count=cases,
        removed_cards_per_case=removed,
        seed=seed,
    )


def test_same_seed_reproduces_complete_batch_exactly() -> None:
    assert generate() == generate()


def test_different_seed_changes_nontrivial_sample_sequence() -> None:
    first = generate(seed=1)
    second = generate(seed=2)

    assert [case.sampled_removed_ranks for case in first.cases] != [
        case.sampled_removed_ranks for case in second.cases
    ]


def test_case_count_removal_count_ids_and_definition_pairing() -> None:
    experiment = generate(cases=4, removed=7)

    assert [case.case_id for case in experiment.cases] == [
        "case-0001",
        "case-0002",
        "case-0003",
        "case-0004",
    ]
    assert [case.case_index for case in experiment.cases] == [1, 2, 3, 4]
    assert all(len(case.sampled_removed_ranks) == 7 for case in experiment.cases)
    assert all(
        tuple(result.definition_id for result in case.research_results)
        == experiment.definition_ids
        for case in experiment.cases
    )


def test_sampling_respects_multiplicity_and_each_case_resets_to_base() -> None:
    state = build_table_state(base_payload())
    assert state.game_state is not None
    available = dict(zip(tuple(Rank), remaining_rank_counts(state.game_state.shoe)))
    experiment = generate(cases=3, removed=20)

    for case in experiment.cases:
        sampled = Counter(case.sampled_removed_ranks)
        assert all(sampled[rank] <= available[rank] for rank in Rank)
    assert sum(len(case.sampled_removed_ranks) for case in experiment.cases) == 60
    assert state.game_state.shoe.exact_total == 48


def test_original_state_is_immutable() -> None:
    state = build_table_state(base_payload())
    original = state

    generate_batch_experiment(
        state,
        (get_primary_definition("wong_halves"),),
        case_count=2,
        removed_cards_per_case=5,
        seed=8,
    )

    assert state == original
    assert state.game_state is not None
    assert state.game_state.shoe.exact_total == 48


def test_case_score_matches_direct_generic_rank_scoring() -> None:
    state = build_table_state(base_payload())
    experiment = generate(cases=2, removed=5)
    base_ranks = tuple(card.rank for card in table_observations(state))

    for case in experiment.cases:
        for result in case.research_results:
            direct = score_known_ranks(
                get_primary_definition(result.definition_id),
                base_ranks + case.sampled_removed_ranks,
                deck_count=1,
            )
            assert result.score == direct.score
            assert isinstance(result.score, Fraction)


def test_case_exact_reference_matches_existing_solver() -> None:
    state = build_table_state(base_payload())
    assert state.game_state is not None
    case = generate(cases=2, removed=4).cases[0]
    case_state = replace(
        state,
        known_card_count=state.known_card_count + 4,
        game_state=replace(
            state.game_state,
            shoe=shoe_after_rank_removals(
                state.game_state.shoe, case.sampled_removed_ranks
            ),
        ),
    )
    direct = analyze_exact_table(case_state)

    assert case.exact_reference.status == "available"
    assert case.exact_reference.outcomes == direct.outcomes
    assert direct.outcomes.total == pytest.approx(1.0, abs=1e-10)


def test_generated_case_shoe_remains_physically_valid() -> None:
    state = build_table_state(base_payload())
    assert state.game_state is not None
    for case in generate(cases=5, removed=20).cases:
        case_shoe = shoe_after_rank_removals(
            state.game_state.shoe, case.sampled_removed_ranks
        )
        assert case_shoe.exact_total == state.game_state.shoe.exact_total - 20
        assert all(count >= 0 for count in case_shoe.card_counts)
        before = dict(
            zip(tuple(Rank), remaining_rank_counts(state.game_state.shoe))
        )
        after = dict(zip(tuple(Rank), remaining_rank_counts(case_shoe)))
        sampled = Counter(case.sampled_removed_ranks)
        assert all(after[rank] == before[rank] - sampled[rank] for rank in Rank)


def test_unavailable_exact_result_is_retained(monkeypatch) -> None:
    def unavailable(*args, **kwargs):
        raise ExactAnalysisError("exact_computation_limit", "limit reached")

    monkeypatch.setattr("app.research.experiments.analyze_exact_table", unavailable)
    experiment = generate(cases=2)

    assert len(experiment.cases) == 2
    assert experiment.exact_unavailable_count == 2
    assert all(
        case.exact_reference.status == "unavailable" for case in experiment.cases
    )
    assert all(
        case.exact_reference.error_code == "exact_computation_limit"
        for case in experiment.cases
    )
    assert all(len(case.research_results) == 3 for case in experiment.cases)


def test_unknown_observation_rejects_ambiguous_base_composition() -> None:
    payload = base_payload().model_copy(
        update={
            "dealer": base_payload().dealer.model_copy(
                update={"cards": [*base_payload().dealer.cards, {"kind": "unknown"}]}
            )
        }
    )
    state = build_table_state(TableStateSchema.model_validate(payload))

    with pytest.raises(ExperimentValidationError) as caught:
        generate_batch_experiment(
            state,
            APPROVED_PRIMARY_DEFINITIONS,
            case_count=2,
            removed_cards_per_case=1,
            seed=1,
        )

    assert caught.value.code == "batch_requires_resolved_composition"


def test_generated_state_contract_remains_valid() -> None:
    state = build_table_state(base_payload())
    assert validate_table_state(state).valid
    assert generate(cases=2, removed=0).cases[0].sampled_removed_ranks == ()
