from dataclasses import dataclass

from app.domain import ObservedCard
from app.engine import ReconstructedTableState

from .count_engine import ResearchScore, score_observations
from .definitions import ResearchDefinition, get_primary_definition


@dataclass(frozen=True, slots=True)
class ResearchComparison:
    scores: tuple[ResearchScore, ...]


def table_observations(state: ReconstructedTableState) -> tuple[ObservedCard, ...]:
    return (
        state.dealer_hand.cards
        + tuple(card for player in state.players for card in player.hand.cards)
        + state.discarded_cards
    )


def compare_table_research(
    state: ReconstructedTableState,
    definition_ids: tuple[str, ...],
    *,
    include_ace_information: bool = False,
) -> ResearchComparison:
    observations = table_observations(state)
    definitions: tuple[ResearchDefinition, ...] = tuple(
        get_primary_definition(identifier) for identifier in definition_ids
    )
    return ResearchComparison(
        scores=tuple(
            score_observations(
                definition,
                observations,
                deck_count=state.deck_count,
                include_ace_information=include_ace_information,
            )
            for definition in definitions
        )
    )
