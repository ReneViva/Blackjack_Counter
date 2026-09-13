r"""Deterministic Phase 27 profiling for representative application workloads.

Run from ``backend`` with the project interpreter::

    ..\.venv\Scripts\python.exe profile_performance.py

The harness deliberately has no wall-clock assertions and writes no profile dumps.
"""

from __future__ import annotations

import argparse
import cProfile
from dataclasses import asdict
import io
import json
import platform
import pstats
from statistics import median
import sys
from time import perf_counter
import tracemalloc
from typing import Any, Callable

from app.engine import build_table_state
from app.probability import (
    ExactAnalysisError,
    analyze_exact_table,
    concrete_scenarios,
    simulate_table,
)
from app.research import compare_table_research, get_primary_definition
from app.research.experiments import generate_batch_experiment
from app.schemas import TableStateSchema


RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "D", "C")
RESEARCH_DEFINITIONS = ("wong_halves", "zen_count", "omega_ii")
SEED = 20_260_913
MONTE_CARLO_TRIALS = 10_000
BATCH_CASES = 8
BATCH_REMOVED_CARDS = 6


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def unknown() -> dict[str, str]:
    return {"kind": "unknown"}


def table_payload(
    *,
    decks: int | None = 1,
    dealer_soft_17: str | None = "stand",
    dealer: list[dict[str, str]],
    player: list[dict[str, str]],
    discarded: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    return {
        "rules": {"decks": decks, "dealer_soft_17": dealer_soft_17},
        "dealer": {"cards": dealer},
        "players": [{"seat": 4, "is_user": True, "cards": player}],
        "discarded_cards": discarded or [],
    }


def exact_small_payload() -> dict[str, object]:
    retained = {("5", "S"), ("10", "S")}
    visible = {("6", "D"), ("10", "C"), ("10", "H"), ("K", "H")}
    return table_payload(
        dealer=[known("6", "D"), known("10", "C")],
        player=[known("10", "H"), known("K", "H")],
        discarded=[
            known(rank, suit)
            for rank in RANKS
            for suit in SUITS
            if (rank, suit) not in retained | visible
        ],
    )


def exact_moderate_payload() -> dict[str, object]:
    return table_payload(
        dealer=[known("2", "D"), known("3", "C")],
        player=[known("10", "H"), known("9", "H")],
    )


def dealer_sixteen_payload() -> dict[str, object]:
    return table_payload(
        dealer=[known("6", "D"), known("10", "C")],
        player=[known("10", "H"), known("9", "H")],
    )


def hidden_payload() -> dict[str, object]:
    return table_payload(
        dealer=[known("10", "D"), unknown()],
        player=[known("10", "H"), known("K", "H")],
    )


def scenario_payload() -> dict[str, object]:
    payload = exact_small_payload()
    payload["rules"] = {"decks": None, "dealer_soft_17": None}
    return payload


def build(payload: dict[str, object]):
    return build_table_state(TableStateSchema.model_validate(payload))


def exact_snapshot(result) -> dict[str, object]:
    return {
        "outcomes": asdict(result.outcomes),
        "states_evaluated": result.metrics.states_evaluated,
        "cache_hits": result.metrics.cache_hits,
        "cache_misses": result.metrics.cache_misses,
        "hidden_states_evaluated": result.hidden_states_evaluated,
        "hidden_weight_mass": result.hidden_weight_mass,
    }


def run_exact_small() -> dict[str, object]:
    return exact_snapshot(analyze_exact_table(build(exact_small_payload())))


def run_exact_moderate() -> dict[str, object]:
    return exact_snapshot(analyze_exact_table(build(exact_moderate_payload())))


def run_hidden() -> dict[str, object]:
    return exact_snapshot(analyze_exact_table(build(hidden_payload())))


def run_scenarios() -> dict[str, object]:
    schema = TableStateSchema.model_validate(scenario_payload())
    plan = concrete_scenarios(schema)
    scenarios: list[dict[str, object]] = []
    total_states = total_hits = total_misses = hidden_states = 0
    for scenario in plan.scenarios:
        try:
            result = analyze_exact_table(build_table_state(scenario.state))
        except ExactAnalysisError as error:
            scenarios.append(
                {
                    "decks": scenario.assumptions.decks,
                    "dealer_soft_17": scenario.assumptions.dealer_soft_17.value,
                    "error": error.code,
                }
            )
            continue
        total_states += result.metrics.states_evaluated
        total_hits += result.metrics.cache_hits
        total_misses += result.metrics.cache_misses
        hidden_states += result.hidden_states_evaluated
        scenarios.append(
            {
                "decks": scenario.assumptions.decks,
                "dealer_soft_17": scenario.assumptions.dealer_soft_17.value,
                "outcomes": asdict(result.outcomes),
            }
        )
    return {
        "uncertainty": plan.uncertainty,
        "scenario_count": len(plan.scenarios),
        "aggregation": "none",
        "states_evaluated": total_states,
        "cache_hits": total_hits,
        "cache_misses": total_misses,
        "hidden_states_evaluated": hidden_states,
        "scenarios": scenarios,
    }


def run_monte_carlo() -> dict[str, object]:
    result = simulate_table(
        build(dealer_sixteen_payload()),
        MONTE_CARLO_TRIALS,
        seed=SEED,
    )
    return {
        "seed": result.seed,
        "simulations": result.simulations,
        "counts": asdict(result.counts),
        "outcomes": asdict(result.outcomes),
    }


def run_research_compare() -> dict[str, object]:
    result = compare_table_research(
        build(dealer_sixteen_payload()),
        RESEARCH_DEFINITIONS,
        include_ace_information=True,
    )
    return {
        "definition_ids": [score.definition_id for score in result.scores],
        "fractions": [str(score.score) for score in result.scores],
        "known_cards": [score.observed_known_cards for score in result.scores],
    }


def run_research_batch() -> dict[str, object]:
    experiment = generate_batch_experiment(
        build(dealer_sixteen_payload()),
        tuple(get_primary_definition(item) for item in RESEARCH_DEFINITIONS),
        case_count=BATCH_CASES,
        removed_cards_per_case=BATCH_REMOVED_CARDS,
        seed=SEED,
        include_ace_information=True,
    )
    return {
        "seed": experiment.seed,
        "case_count": len(experiment.cases),
        "removed_cards_per_case": experiment.removed_cards_per_case,
        "exact_available": len(experiment.cases) - experiment.exact_unavailable_count,
        "exact_unavailable": experiment.exact_unavailable_count,
        "sampled_ranks": [
            [rank.value for rank in case.sampled_removed_ranks]
            for case in experiment.cases
        ],
        "outcomes": [
            asdict(case.exact_reference.outcomes)
            if case.exact_reference.outcomes is not None
            else {"error": case.exact_reference.error_code}
            for case in experiment.cases
        ],
        "research_fractions": [
            [str(score.score) for score in case.research_results]
            for case in experiment.cases
        ],
    }


WORKLOADS: dict[str, tuple[Callable[[], dict[str, object]], int]] = {
    "exact_small": (run_exact_small, 7),
    "exact_moderate": (run_exact_moderate, 7),
    "hidden_marginalization": (run_hidden, 5),
    "scenario_analysis": (run_scenarios, 3),
    "monte_carlo": (run_monte_carlo, 3),
    "research_compare": (run_research_compare, 9),
    "research_batch": (run_research_batch, 3),
}


def measure(
    operation: Callable[[], dict[str, object]], repetitions: int
) -> tuple[dict[str, object], dict[str, float | int]]:
    operation()  # Warm-up; intentionally excluded.
    durations: list[float] = []
    expected: dict[str, object] | None = None
    for _ in range(repetitions):
        started = perf_counter()
        result = operation()
        durations.append((perf_counter() - started) * 1_000.0)
        if expected is None:
            expected = result
        elif result != expected:
            raise AssertionError("deterministic workload output changed between repetitions")
    assert expected is not None
    return expected, {
        "warmups": 1,
        "repetitions": repetitions,
        "median_ms": median(durations),
        "min_ms": min(durations),
        "max_ms": max(durations),
    }


def cpu_profile(operation: Callable[[], dict[str, object]]) -> dict[str, object]:
    profiler = cProfile.Profile()
    profiler.enable()
    operation()
    profiler.disable()
    stats = pstats.Stats(profiler)
    rows: list[dict[str, object]] = []
    for (filename, line, function), values in sorted(
        stats.stats.items(), key=lambda item: item[1][3], reverse=True
    )[:15]:
        primitive_calls, total_calls, own_time, cumulative_time, _ = values
        rows.append(
            {
                "function": f"{filename}:{line}({function})",
                "primitive_calls": primitive_calls,
                "total_calls": total_calls,
                "own_ms": own_time * 1_000.0,
                "cumulative_ms": cumulative_time * 1_000.0,
            }
        )
    stream = io.StringIO()
    pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats(15)
    return {"top_cumulative": rows, "pstats": stream.getvalue()}


def memory_profile(operation: Callable[[], dict[str, object]]) -> dict[str, float]:
    tracemalloc.start()
    try:
        operation()
        current, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    return {
        "current_mib": current / (1024 * 1024),
        "peak_mib": peak / (1024 * 1024),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="measurement")
    args = parser.parse_args()

    measurements: dict[str, dict[str, object]] = {}
    for name, (operation, repetitions) in WORKLOADS.items():
        result, timing = measure(operation, repetitions)
        measurements[name] = {"timing": timing, "result": result}

    expensive_name = max(
        measurements,
        key=lambda name: float(measurements[name]["timing"]["median_ms"]),
    )
    expensive_operation = WORKLOADS[expensive_name][0]
    output: dict[str, Any] = {
        "label": args.label,
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
        },
        "fixtures": {
            "exact_small": "1 deck, S17, player 20, dealer 16, two remaining cards",
            "exact_moderate": "1 deck, S17, player 19, dealer 5, 48 remaining cards",
            "hidden_marginalization": "1 deck, S17, player 20, dealer ten plus latent hole card",
            "scenario_analysis": "unknown 1-8 decks and unknown S17/H17; 16 explicit unaggregated scenarios",
            "monte_carlo": {
                "state": "1 deck, S17, player 19, dealer 16",
                "seed": SEED,
                "trials": MONTE_CARLO_TRIALS,
            },
            "research_compare": {
                "state": "1 deck, S17, player 19, dealer 16",
                "definitions": RESEARCH_DEFINITIONS,
            },
            "research_batch": {
                "state": "1 deck, S17, player 19, dealer 16",
                "definitions": RESEARCH_DEFINITIONS,
                "seed": SEED,
                "case_count": BATCH_CASES,
                "removed_cards_per_case": BATCH_REMOVED_CARDS,
            },
        },
        "measurements": measurements,
        "cpu_profile": {
            "workload": expensive_name,
            **cpu_profile(expensive_operation),
        },
        "memory": {
            "most_expensive": {
                "workload": expensive_name,
                **memory_profile(expensive_operation),
            },
            "exact_hidden": {
                "workload": "hidden_marginalization",
                **memory_profile(run_hidden),
            },
            "research_batch": {
                "workload": "research_batch",
                **memory_profile(run_research_batch),
            },
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
