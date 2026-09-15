from dataclasses import dataclass, replace
from fractions import Fraction
import random

from app.domain import ALL_CARDS, Card, DealerCheckResult, Rank, Shoe
from app.engine import ReconstructedTableState, validate_table_state
from app.probability import ExactAnalysisError, analyze_exact_table
from app.probability.distribution import OutcomeDistribution

from .comparison import table_observations
from .count_engine import ResearchScore, score_known_ranks
from .definitions import ResearchDefinition


MAX_CASE_COUNT = 50
MAX_REMOVED_CARDS_PER_CASE = 20
EXPERIMENT_VERSION = "1"

_RANKS = tuple(Rank)
_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}


class ExperimentValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class ExactReferenceResult:
    status: str
    outcomes: OutcomeDistribution | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass(frozen=True, slots=True)
class ExperimentCase:
    case_id: str
    case_index: int
    sampled_removed_ranks: tuple[Rank, ...]
    exact_reference: ExactReferenceResult
    research_results: tuple[ResearchScore, ...]

    @property
    def exact_outcome_balance(self) -> float | None:
        if self.exact_reference.outcomes is None:
            return None
        return (
            self.exact_reference.outcomes.win
            - self.exact_reference.outcomes.loss
        )


@dataclass(frozen=True, slots=True)
class BatchExperiment:
    seed: int
    requested_case_count: int
    removed_cards_per_case: int
    definition_ids: tuple[str, ...]
    source_id: str
    cases: tuple[ExperimentCase, ...]

    @property
    def exact_unavailable_count(self) -> int:
        return sum(case.exact_reference.status == "unavailable" for case in self.cases)


def remaining_rank_counts(shoe: Shoe) -> tuple[int, ...]:
    return tuple(
        sum(count for card, count in shoe.composition if card.rank is rank)
        for rank in _RANKS
    )


def _sample_rank(counts: list[int], rng: random.Random) -> Rank:
    total = sum(counts)
    ticket = rng.randrange(total)
    cumulative = 0
    for index, count in enumerate(counts):
        cumulative += count
        if ticket < cumulative:
            counts[index] -= 1
            return _RANKS[index]
    raise RuntimeError("rank sampling failed to select an available rank")


def sample_removed_ranks(
    shoe: Shoe,
    count: int,
    rng: random.Random,
) -> tuple[Rank, ...]:
    if isinstance(count, bool) or not isinstance(count, int):
        raise TypeError("removed-card count must be an integer")
    if not 0 <= count <= MAX_REMOVED_CARDS_PER_CASE:
        raise ValueError("removed-card count must be between 0 and 20")
    counts = list(remaining_rank_counts(shoe))
    if count > sum(counts):
        raise ExperimentValidationError(
            "insufficient_remaining_cards",
            "The base shoe does not contain enough cards for each requested case.",
        )
    return tuple(_sample_rank(counts, rng) for _ in range(count))


def shoe_after_rank_removals(shoe: Shoe, ranks: tuple[Rank, ...]) -> Shoe:
    """Apply rank removals using a canonical suit slot only as shoe storage.

    Exact recursion and its cache key consume rank multiplicities, so this does
    not assert or expose a generated suit identity.
    """
    counts = list(shoe.card_counts)
    for rank in ranks:
        for card in ALL_CARDS:
            index = _CARD_INDEX[card]
            if card.rank is rank and counts[index] > 0:
                counts[index] -= 1
                break
        else:
            raise ExperimentValidationError(
                "sampled_rank_unavailable",
                f"Sampled rank {rank.value} exceeded its remaining multiplicity.",
            )
    return Shoe(decks=shoe.decks, card_counts=tuple(counts))


def _require_eligible_base_state(state: ReconstructedTableState, removed: int) -> None:
    validation = validate_table_state(state)
    if not validation.valid:
        raise ExperimentValidationError("invalid_state", validation.errors[0].message)
    if (
        state.deck_count is None
        or state.dealer_soft_17 is None
        or state.game_state is None
    ):
        raise ExperimentValidationError(
            "batch_requires_concrete_model",
            "Batch experiments require known deck count and soft-17 rules.",
        )
    if state.unknown_card_count or state.game_state.shoe.unknown_removed_count:
        raise ExperimentValidationError(
            "batch_requires_resolved_composition",
            "Batch experiments require a fully resolved remaining composition.",
        )
    if state.game_state.shoe.has_value_only_removals:
        raise ExperimentValidationError(
            "batch_requires_exact_composition",
            "Batch rank-sampling experiments require exact-rank composition.",
        )
    users = tuple(player for player in state.players if player.is_user)
    if len(users) != 1:
        raise ExperimentValidationError(
            "invalid_state",
            "Batch exact analysis requires exactly one player marked as the user.",
        )
    if removed > state.game_state.shoe.exact_total:
        raise ExperimentValidationError(
            "insufficient_remaining_cards",
            "The base shoe does not contain enough cards for each requested case.",
        )


def _case_state(
    state: ReconstructedTableState,
    sampled_ranks: tuple[Rank, ...],
) -> ReconstructedTableState:
    assert state.game_state is not None
    shoe = shoe_after_rank_removals(state.game_state.shoe, sampled_ranks)
    return replace(
        state,
        known_card_count=state.known_card_count + len(sampled_ranks),
        game_state=replace(state.game_state, shoe=shoe),
    )


def generate_batch_experiment(
    state: ReconstructedTableState,
    definitions: tuple[ResearchDefinition, ...],
    *,
    case_count: int,
    removed_cards_per_case: int,
    seed: int,
    include_ace_information: bool = False,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
) -> BatchExperiment:
    if not definitions:
        raise ExperimentValidationError(
            "missing_research_definition", "Select at least one research definition."
        )
    if len(definitions) > 4:
        raise ExperimentValidationError(
            "too_many_research_definitions",
            "Select no more than four research definitions.",
        )
    definition_ids = tuple(definition.identifier for definition in definitions)
    if len(definition_ids) != len(set(definition_ids)):
        raise ExperimentValidationError(
            "duplicate_research_definition",
            "Primary research definitions must be unique.",
        )
    if (
        isinstance(case_count, bool)
        or not isinstance(case_count, int)
        or not 2 <= case_count <= MAX_CASE_COUNT
    ):
        raise ExperimentValidationError(
            "invalid_case_count", "Case count must be between 2 and 50."
        )
    if (
        isinstance(removed_cards_per_case, bool)
        or not isinstance(removed_cards_per_case, int)
        or not 0 <= removed_cards_per_case <= MAX_REMOVED_CARDS_PER_CASE
    ):
        raise ExperimentValidationError(
            "invalid_removed_card_count",
            "Removed cards per case must be between 0 and 20.",
        )
    if (
        isinstance(seed, bool)
        or not isinstance(seed, int)
        or not 0 <= seed <= 9_223_372_036_854_775_807
    ):
        raise ExperimentValidationError(
            "invalid_seed", "Seed is outside the supported range."
        )
    _require_eligible_base_state(state, removed_cards_per_case)
    assert state.game_state is not None

    base_ranks = tuple(
        card.rank
        for card in table_observations(state)
        if isinstance(card, Card)
    )
    rng = random.Random(seed)
    cases: list[ExperimentCase] = []
    for index in range(1, case_count + 1):
        sampled = sample_removed_ranks(
            state.game_state.shoe, removed_cards_per_case, rng
        )
        case_state = _case_state(state, sampled)
        try:
            exact = analyze_exact_table(
                case_state, dealer_check_result=dealer_check_result
            )
            reference = ExactReferenceResult(
                status="available", outcomes=exact.outcomes
            )
        except ExactAnalysisError as error:
            reference = ExactReferenceResult(
                status="unavailable",
                error_code=error.code,
                error_message=error.message,
            )
        research_results = tuple(
            score_known_ranks(
                definition,
                base_ranks + sampled,
                deck_count=state.deck_count,
                include_ace_information=include_ace_information,
            )
            for definition in definitions
        )
        cases.append(
            ExperimentCase(
                case_id=f"case-{index:04d}",
                case_index=index,
                sampled_removed_ranks=sampled,
                exact_reference=reference,
                research_results=research_results,
            )
        )
    return BatchExperiment(
        seed=seed,
        requested_case_count=case_count,
        removed_cards_per_case=removed_cards_per_case,
        definition_ids=definition_ids,
        source_id=definitions[0].source.source_id,
        cases=tuple(cases),
    )
