from dataclasses import dataclass
import math

from .experiments import ExperimentCase


PEARSON_FORMULA = "pearson_centered_sums_v1"
WIN_PROBABILITY_METRIC = "pearson_score_vs_win_probability"
OUTCOME_BALANCE_METRIC = "pearson_score_vs_outcome_balance"


@dataclass(frozen=True, slots=True)
class PearsonMetric:
    metric_id: str
    definition_id: str
    source_id: str
    target: str
    status: str
    value: float | None
    total_cases: int
    eligible_cases: int
    excluded_incomplete_score: int
    excluded_exact_unavailable: int
    excluded_nonfinite: int
    formula: str = PEARSON_FORMULA


def pearson_correlation(
    x_values: tuple[float, ...], y_values: tuple[float, ...]
) -> tuple[str, float | None]:
    if len(x_values) != len(y_values):
        raise ValueError("Pearson inputs must have equal lengths")
    if len(x_values) < 2:
        return "insufficient_data", None
    x_mean = math.fsum(x_values) / len(x_values)
    y_mean = math.fsum(y_values) / len(y_values)
    x_centered = tuple(value - x_mean for value in x_values)
    y_centered = tuple(value - y_mean for value in y_values)
    x_variance = math.fsum(value * value for value in x_centered)
    y_variance = math.fsum(value * value for value in y_centered)
    if x_variance == 0.0 or y_variance == 0.0:
        return "undefined_constant_input", None
    numerator = math.fsum(
        x_value * y_value
        for x_value, y_value in zip(x_centered, y_centered, strict=True)
    )
    value = numerator / math.sqrt(x_variance * y_variance)
    if not math.isfinite(value):
        return "undefined_constant_input", None
    return "available", value


def _metric_for_target(
    cases: tuple[ExperimentCase, ...],
    definition_id: str,
    source_id: str,
    metric_id: str,
    target: str,
) -> PearsonMetric:
    x_values: list[float] = []
    y_values: list[float] = []
    excluded_incomplete = 0
    excluded_exact = 0
    excluded_nonfinite = 0
    for case in cases:
        result = next(
            item
            for item in case.research_results
            if item.definition_id == definition_id
        )
        if not result.complete:
            excluded_incomplete += 1
            continue
        outcomes = case.exact_reference.outcomes
        if case.exact_reference.status != "available" or outcomes is None:
            excluded_exact += 1
            continue
        x_value = float(result.score)
        y_value = (
            outcomes.win
            if target == "exact_win_probability"
            else outcomes.win - outcomes.loss
        )
        if not math.isfinite(x_value) or not math.isfinite(y_value):
            excluded_nonfinite += 1
            continue
        x_values.append(x_value)
        y_values.append(y_value)
    status, value = pearson_correlation(tuple(x_values), tuple(y_values))
    return PearsonMetric(
        metric_id=metric_id,
        definition_id=definition_id,
        source_id=source_id,
        target=target,
        status=status,
        value=value,
        total_cases=len(cases),
        eligible_cases=len(x_values),
        excluded_incomplete_score=excluded_incomplete,
        excluded_exact_unavailable=excluded_exact,
        excluded_nonfinite=excluded_nonfinite,
    )


def compute_experiment_metrics(
    cases: tuple[ExperimentCase, ...], definition_ids: tuple[str, ...]
) -> tuple[PearsonMetric, ...]:
    metrics: list[PearsonMetric] = []
    for definition_id in definition_ids:
        source_id = next(
            result.source_id
            for case in cases
            for result in case.research_results
            if result.definition_id == definition_id
        )
        metrics.extend(
            (
                _metric_for_target(
                    cases,
                    definition_id,
                    source_id,
                    WIN_PROBABILITY_METRIC,
                    "exact_win_probability",
                ),
                _metric_for_target(
                    cases,
                    definition_id,
                    source_id,
                    OUTCOME_BALANCE_METRIC,
                    "exact_outcome_balance",
                ),
            )
        )
    return tuple(metrics)
