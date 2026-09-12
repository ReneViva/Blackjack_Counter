from dataclasses import dataclass

from app.domain import DealerCheckResult

from .analysis import ExactTableAnalysis, analyze_exact_table
from .confidence import WilsonInterval, wilson_interval
from .exact import ExactAnalysisError
from .monte_carlo import MonteCarloEvaluation, simulate_table


@dataclass(frozen=True, slots=True)
class OutcomeComparison:
    exact_probability: float
    monte_carlo_estimate: float
    confidence_interval: WilsonInterval
    signed_error: float
    absolute_error: float
    exact_in_confidence_interval: bool


@dataclass(frozen=True, slots=True)
class ComparisonEvaluation:
    exact: ExactTableAnalysis | None
    monte_carlo: MonteCarloEvaluation
    win: OutcomeComparison | None
    push: OutcomeComparison | None
    loss: OutcomeComparison | None
    exact_error: ExactAnalysisError | None = None


def _outcome_comparison(
    exact: float,
    estimate: float,
    successes: int,
    trials: int,
    confidence_level: float,
) -> OutcomeComparison:
    interval = wilson_interval(successes, trials, confidence_level)
    signed_error = estimate - exact
    return OutcomeComparison(
        exact_probability=exact,
        monte_carlo_estimate=estimate,
        confidence_interval=interval,
        signed_error=signed_error,
        absolute_error=abs(signed_error),
        exact_in_confidence_interval=interval.lower <= exact <= interval.upper,
    )


def compare_table(
    state,
    simulations: int,
    *,
    seed: int | None = None,
    confidence_level: float = 0.95,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_exact_states: int = 2_000_000,
) -> ComparisonEvaluation:
    exact: ExactTableAnalysis | None
    exact_error: ExactAnalysisError | None = None
    try:
        exact = analyze_exact_table(
            state,
            dealer_check_result=dealer_check_result,
            max_states=max_exact_states,
        )
    except ExactAnalysisError as error:
        if error.code != "exact_computation_limit":
            raise
        exact = None
        exact_error = error

    monte_carlo = simulate_table(
        state,
        simulations,
        seed=seed,
        dealer_check_result=dealer_check_result,
    )
    if exact is None:
        return ComparisonEvaluation(
            exact=None,
            monte_carlo=monte_carlo,
            win=None,
            push=None,
            loss=None,
            exact_error=exact_error,
        )
    return ComparisonEvaluation(
        exact=exact,
        monte_carlo=monte_carlo,
        win=_outcome_comparison(
            exact.outcomes.win,
            monte_carlo.outcomes.win,
            monte_carlo.counts.win,
            simulations,
            confidence_level,
        ),
        push=_outcome_comparison(
            exact.outcomes.push,
            monte_carlo.outcomes.push,
            monte_carlo.counts.push,
            simulations,
            confidence_level,
        ),
        loss=_outcome_comparison(
            exact.outcomes.loss,
            monte_carlo.outcomes.loss,
            monte_carlo.counts.loss,
            simulations,
            confidence_level,
        ),
    )
