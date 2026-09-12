from dataclasses import FrozenInstanceError
from fractions import Fraction
from hashlib import sha256
from pathlib import Path

import pytest

from app.domain import Rank
from app.research import (
    ACE_INFORMATION,
    APPROVED_PRIMARY_DEFINITIONS,
    OMEGA_II,
    SOURCE_ID,
    SOURCE_PATH,
    SOURCE_SHA256,
    WONG_HALVES,
    ZEN_COUNT,
    AceClassification,
    ResearchDefinition,
    UnknownResearchDefinitionError,
    get_primary_definition,
)


# Approved source locator: "Comparison and technical baseline" table, tags in
# A, 2, 3, 4, 5, 6, 7, 8, 9, T/J/Q/K order. These expectations are an
# independent transcription and never read production definition constants.
GOLDEN_TAGS = {
    "wong_halves": {
        Rank.ACE: Fraction(-1),
        Rank.TWO: Fraction(1, 2),
        Rank.THREE: Fraction(1),
        Rank.FOUR: Fraction(1),
        Rank.FIVE: Fraction(3, 2),
        Rank.SIX: Fraction(1),
        Rank.SEVEN: Fraction(1, 2),
        Rank.EIGHT: Fraction(0),
        Rank.NINE: Fraction(-1, 2),
        Rank.TEN: Fraction(-1),
        Rank.JACK: Fraction(-1),
        Rank.QUEEN: Fraction(-1),
        Rank.KING: Fraction(-1),
    },
    "zen_count": {
        Rank.ACE: Fraction(-1),
        Rank.TWO: Fraction(1),
        Rank.THREE: Fraction(1),
        Rank.FOUR: Fraction(2),
        Rank.FIVE: Fraction(2),
        Rank.SIX: Fraction(2),
        Rank.SEVEN: Fraction(1),
        Rank.EIGHT: Fraction(0),
        Rank.NINE: Fraction(0),
        Rank.TEN: Fraction(-2),
        Rank.JACK: Fraction(-2),
        Rank.QUEEN: Fraction(-2),
        Rank.KING: Fraction(-2),
    },
    "omega_ii": {
        Rank.ACE: Fraction(0),
        Rank.TWO: Fraction(1),
        Rank.THREE: Fraction(1),
        Rank.FOUR: Fraction(2),
        Rank.FIVE: Fraction(2),
        Rank.SIX: Fraction(2),
        Rank.SEVEN: Fraction(1),
        Rank.EIGHT: Fraction(0),
        Rank.NINE: Fraction(-1),
        Rank.TEN: Fraction(-2),
        Rank.JACK: Fraction(-2),
        Rank.QUEEN: Fraction(-2),
        Rank.KING: Fraction(-2),
    },
}


def test_approved_source_hash_and_size_are_exact() -> None:
    source = Path(__file__).parents[2] / SOURCE_PATH
    content = source.read_bytes()

    assert len(content) == 41_329
    assert sha256(content).hexdigest() == SOURCE_SHA256
    assert SOURCE_SHA256 == (
        "343d59fc6f988e3a711ff16d184531af619774564511eaad63802cd034b91447"
    )


def test_only_required_primary_definitions_are_registered() -> None:
    assert tuple(item.identifier for item in APPROVED_PRIMARY_DEFINITIONS) == (
        "wong_halves",
        "zen_count",
        "omega_ii",
    )
    identifiers = {item.identifier for item in APPROVED_PRIMARY_DEFINITIONS}
    assert "hi_lo" not in identifiers
    assert ACE_INFORMATION.identifier not in identifiers


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_every_definition_has_exactly_all_thirteen_ranks(
    definition: ResearchDefinition,
) -> None:
    assert len(definition.tags) == 13
    assert tuple(rank for rank, _ in definition.tags) == tuple(Rank)
    assert set(rank for rank, _ in definition.tags) == set(Rank)


@pytest.mark.parametrize("definition_id", tuple(GOLDEN_TAGS))
@pytest.mark.parametrize("rank", tuple(Rank))
def test_every_rank_matches_independent_source_golden_value(
    definition_id: str, rank: Rank
) -> None:
    definition = get_primary_definition(definition_id)

    assert definition.tag_for(rank) == GOLDEN_TAGS[definition_id][rank]
    assert isinstance(definition.tag_for(rank), Fraction)


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_each_ten_valued_rank_has_the_same_exact_tag(
    definition: ResearchDefinition,
) -> None:
    assert definition.tag_for(Rank.TEN) == definition.tag_for(Rank.JACK)
    assert definition.tag_for(Rank.TEN) == definition.tag_for(Rank.QUEEN)
    assert definition.tag_for(Rank.TEN) == definition.tag_for(Rank.KING)


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_balanced_definition_checksum_is_exact_zero(
    definition: ResearchDefinition,
) -> None:
    independent_checksum = sum(
        (tag * 4 for tag in GOLDEN_TAGS[definition.identifier].values()),
        start=Fraction(0),
    )

    assert definition.balanced is True
    assert independent_checksum == Fraction(0)
    assert definition.one_deck_tag_sum == Fraction(0)


def test_source_backed_classification_and_metadata() -> None:
    assert WONG_HALVES.level == 3
    assert WONG_HALVES.ace_classification is AceClassification.RECKONED
    assert ZEN_COUNT.level == 2
    assert ZEN_COUNT.ace_classification is AceClassification.RECKONED
    assert OMEGA_II.level == 2
    assert OMEGA_II.ace_classification is AceClassification.NEUTRAL
    for definition in APPROVED_PRIMARY_DEFINITIONS:
        assert definition.source.source_id == SOURCE_ID
        assert definition.source.local_path == SOURCE_PATH
        assert definition.source.sha256 == SOURCE_SHA256
        assert definition.source.locator


def test_wong_halves_fractional_source_scale_is_exact() -> None:
    assert WONG_HALVES.tag_for(Rank.TWO) == Fraction(1, 2)
    assert WONG_HALVES.tag_for(Rank.FIVE) == Fraction(3, 2)
    assert WONG_HALVES.tag_for(Rank.NINE) == Fraction(-1, 2)


def test_definitions_and_nested_metadata_are_immutable() -> None:
    with pytest.raises(FrozenInstanceError):
        WONG_HALVES.identifier = "changed"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        WONG_HALVES.source.source_id = "changed"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        WONG_HALVES.published_metrics.playing_efficiency = (  # type: ignore[misc]
            WONG_HALVES.published_metrics.playing_efficiency
        )
    with pytest.raises(TypeError):
        WONG_HALVES.tags[0] = (Rank.ACE, Fraction(99))  # type: ignore[index]

    assert get_primary_definition("wong_halves") is WONG_HALVES
    assert WONG_HALVES.tag_for(Rank.ACE) == Fraction(-1)


def test_unsupported_definition_cannot_silently_execute() -> None:
    with pytest.raises(UnknownResearchDefinitionError):
        get_primary_definition("ace_information")


def test_definitions_contain_no_strategy_or_wager_data() -> None:
    assert set(WONG_HALVES.__dataclass_fields__) == {
        "identifier",
        "label",
        "tags",
        "balanced",
        "level",
        "ace_classification",
        "source",
        "published_metrics",
    }
