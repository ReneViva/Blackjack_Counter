from collections.abc import Iterable
from dataclasses import dataclass
from fractions import Fraction

from app.domain import Card, ObservedCard, Rank, UnknownCard

from .definitions import AceClassification, ResearchDefinition


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


def score_observations(
    definition: ResearchDefinition,
    observations: Iterable[ObservedCard],
    *,
    deck_count: int | None = None,
    include_ace_information: bool = False,
) -> ResearchScore:
    if not isinstance(definition, ResearchDefinition):
        raise TypeError("definition must be a ResearchDefinition")
    if deck_count is not None and (
        isinstance(deck_count, bool)
        or not isinstance(deck_count, int)
        or not 1 <= deck_count <= 8
    ):
        raise ValueError("deck_count must be None or an integer between 1 and 8")

    observation_snapshot = tuple(observations)
    if not all(isinstance(card, (Card, UnknownCard)) for card in observation_snapshot):
        raise TypeError("observations must contain only observed cards")

    known_cards = tuple(
        card for card in observation_snapshot if isinstance(card, Card)
    )
    unknown_count = sum(
        isinstance(card, UnknownCard) for card in observation_snapshot
    )
    score = sum(
        (definition.tag_for(card.rank) for card in known_cards),
        start=Fraction(0),
    )

    ace_information: AceInformationResult | None = None
    if include_ace_information:
        known_aces = sum(card.rank is Rank.ACE for card in known_cards)
        exact_aces_remaining = (
            deck_count * 4 - known_aces
            if deck_count is not None and unknown_count == 0
            else None
        )
        ace_information = AceInformationResult(
            associated_definition_id=definition.identifier,
            primary_ace_classification=definition.ace_classification,
            known_aces_observed=known_aces,
            exact_aces_remaining=exact_aces_remaining,
            complete=exact_aces_remaining is not None,
        )

    return ResearchScore(
        definition_id=definition.identifier,
        source_id=definition.source.source_id,
        score=score,
        observed_known_cards=len(known_cards),
        unresolved_unknown_cards=unknown_count,
        complete=unknown_count == 0,
        ace_information=ace_information,
    )
