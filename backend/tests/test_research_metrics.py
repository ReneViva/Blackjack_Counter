from fractions import Fraction

import pytest

from app.probability.distribution import OutcomeDistribution
from app.research import (
    ExactReferenceResult,
    ExperimentCase,
    ResearchScore,
    compute_experiment_metrics,
    pearson_correlation,
)


def result(score: int, *, complete: bool = True) -> ResearchScore:
    return ResearchScore(
        definition_id="zen_count",
        source_id="approved-source",
        score=Fraction(score),
        observed_known_cards=1,
        unresolved_unknown_cards=0 if complete else 1,
        complete=complete,
    )


def case(
    index: int,
    score: int,
    *,
    win: float = 0.5,
    loss: float = 0.5,
    complete: bool = True,
    exact: bool = True,
) -> ExperimentCase:
    reference = (
        ExactReferenceResult(
            status="available",
            outcomes=OutcomeDistribution(win=win, push=1.0 - win - loss, loss=loss),
        )
        if exact
        else ExactReferenceResult(
            status="unavailable", error_code="limit", error_message="limit"
        )
    )
    return ExperimentCase(
        case_id=f"case-{index:04d}",
        case_index=index,
        sampled_removed_ranks=(),
        exact_reference=reference,
        research_results=(result(score, complete=complete),),
    )


@pytest.mark.parametrize(
    "x_values,y_values,expected",
    (
        ((1.0, 2.0, 3.0), (2.0, 4.0, 6.0), 1.0),
        ((1.0, 2.0, 3.0), (6.0, 4.0, 2.0), -1.0),
        ((-1.0, 0.0, 1.0), (1.0, -2.0, 1.0), 0.0),
    ),
)
def test_hand_calculated_pearson_fixtures(x_values, y_values, expected) -> None:
    status, value = pearson_correlation(x_values, y_values)

    assert status == "available"
    assert value == pytest.approx(expected, abs=1e-15)


@pytest.mark.parametrize(
    "x_values,y_values",
    (
        ((2.0, 2.0, 2.0), (1.0, 2.0, 3.0)),
        ((1.0, 2.0, 3.0), (2.0, 2.0, 2.0)),
    ),
)
def test_constant_input_is_explicitly_undefined(x_values, y_values) -> None:
    assert pearson_correlation(x_values, y_values) == (
        "undefined_constant_input",
        None,
    )


def test_one_observation_is_insufficient() -> None:
    assert pearson_correlation((1.0,), (0.5,)) == ("insufficient_data", None)


def test_incomplete_and_exact_unavailable_rows_are_counted_as_exclusions() -> None:
    cases = (
        case(1, 1, win=0.2, loss=0.7),
        case(2, 2, win=0.4, loss=0.5),
        case(3, 3, complete=False),
        case(4, 4, exact=False),
    )
    metrics = compute_experiment_metrics(cases, ("zen_count",))

    assert len(metrics) == 2
    for metric in metrics:
        assert metric.total_cases == 4
        assert metric.eligible_cases == 2
        assert metric.excluded_incomplete_score == 1
        assert metric.excluded_exact_unavailable == 1
        assert metric.excluded_nonfinite == 0
        assert metric.formula == "pearson_centered_sums_v1"


def test_metric_targets_are_separate_and_deterministic() -> None:
    cases = (
        case(1, -1, win=0.2, loss=0.7),
        case(2, 0, win=0.4, loss=0.2),
        case(3, 2, win=0.9, loss=0.05),
    )
    first = compute_experiment_metrics(cases, ("zen_count",))
    second = compute_experiment_metrics(cases, ("zen_count",))

    assert first == second
    assert [metric.metric_id for metric in first] == [
        "pearson_score_vs_win_probability",
        "pearson_score_vs_outcome_balance",
    ]
    assert all(metric.status == "available" for metric in first)
    assert all(
        metric.value is not None and -1.0 <= metric.value <= 1.0
        for metric in first
    )


def test_metric_model_has_no_accuracy_ranking_or_static_metadata_fields() -> None:
    fields = set(type(compute_experiment_metrics(
        (case(1, 1), case(2, 2, win=0.6, loss=0.4)), ("zen_count",)
    )[0]).__dataclass_fields__)

    assert not fields.intersection({"accuracy", "rank", "winner", "pe", "bc", "ic"})
