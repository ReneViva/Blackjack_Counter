from collections.abc import Iterable
from dataclasses import dataclass
from fractions import Fraction

from app.domain import (
    BlackjackValueClass,
    Card,
    ObservedCard,
    Rank,
    UnknownCard,
    ValueOnlyCard,
)

from .definitions import AceClassification, ResearchDefinition


_VALUE_CLASS_RANK = {
    BlackjackValueClass.ACE: Rank.ACE,
    BlackjackValueClass.TWO: Rank.TWO,
    BlackjackValueClass.THREE: Rank.THREE,
    BlackjackValueClass.FOUR: Rank.FOUR,
    BlackjackValueClass.FIVE: Rank.FIVE,
    BlackjackValueClass.SIX: Rank.SIX,
    BlackjackValueClass.SEVEN: Rank.SEVEN,
    BlackjackValueClass.EIGHT: Rank.EIGHT,
    BlackjackValueClass.NINE: Rank.NINE,
    BlackjackValueClass.TEN: Rank.TEN,
}


@dataclass(frozen=True, slots=True)
class AceInformationResult:
    associated_definition_id: str
    primary_ace_classification: AceClassification
    known_aces_observed: int
    exact_aces_remaining: int | None
    complete: bool


@dataclass(frozen=True, slots=True)
class ResearchScore:
    definition_id: str
    source_id: str
    score: Fraction
    observed_known_cards: int
    unresolved_unknown_cards: int
    complete: bool
    ace_information: AceInformationResult | None = None


def score_known_ranks(
    definition: ResearchDefinition,
    ranks: Iterable[Rank],
    *,
    deck_count: int | None = None,
    include_ace_information: bool = False,
) -> ResearchScore:
    """Score known rank observations without manufacturing suit identities."""
    if not isinstance(definition, ResearchDefinition):
        raise TypeError("definition must be a ResearchDefinition")
    if deck_count is not None and (
        isinstance(deck_count, bool)
        or not isinstance(deck_count, int)
        or not 1 <= deck_count <= 8
    ):
        raise ValueError("deck_count must be None or an integer between 1 and 8")

    rank_snapshot = tuple(ranks)
    if not all(isinstance(rank, Rank) for rank in rank_snapshot):
        raise TypeError("ranks must contain only Rank values")
    score = sum(
        (definition.tag_for(rank) for rank in rank_snapshot),
        start=Fraction(0),
    )

    ace_information: AceInformationResult | None = None
    if include_ace_information:
        known_aces = sum(rank is Rank.ACE for rank in rank_snapshot)
        ace_information = AceInformationResult(
            associated_definition_id=definition.identifier,
            primary_ace_classification=definition.ace_classification,
            known_aces_observed=known_aces,
            exact_aces_remaining=(
                deck_count * 4 - known_aces if deck_count is not None else None
            ),
            complete=deck_count is not None,
        )

    return ResearchScore(
        definition_id=definition.identifier,
        source_id=definition.source.source_id,
        score=score,
        observed_known_cards=len(rank_snapshot),
        unresolved_unknown_cards=0,
        complete=True,
        ace_information=ace_information,
    )


def score_observations(
    definition: ResearchDefinition,
    observations: Iterable[ObservedCard],
    *,
    deck_count: int | None = None,
    include_ace_information: bool = False,
) -> ResearchScore:
    observation_snapshot = tuple(observations)
    if not all(
        isinstance(card, (Card, ValueOnlyCard, UnknownCard))
        for card in observation_snapshot
    ):
        raise TypeError("observations must contain only observed cards")

    known_ranks = tuple(
        card.rank
        if isinstance(card, Card)
        else _VALUE_CLASS_RANK[card.value]
        for card in observation_snapshot
        if isinstance(card, (Card, ValueOnlyCard))
    )
    unknown_count = sum(
        isinstance(card, UnknownCard) for card in observation_snapshot
    )
    known_result = score_known_ranks(
        definition,
        known_ranks,
        deck_count=deck_count,
        include_ace_information=include_ace_information,
    )

    ace_information = known_result.ace_information
    if ace_information is not None and unknown_count:
        ace_information = AceInformationResult(
            associated_definition_id=ace_information.associated_definition_id,
            primary_ace_classification=(
                ace_information.primary_ace_classification
            ),
            known_aces_observed=ace_information.known_aces_observed,
            exact_aces_remaining=None,
            complete=False,
        )

    return ResearchScore(
        definition_id=definition.identifier,
        source_id=definition.source.source_id,
        score=known_result.score,
        observed_known_cards=len(known_ranks),
        unresolved_unknown_cards=unknown_count,
        complete=unknown_count == 0,
        ace_information=ace_information,
    )
