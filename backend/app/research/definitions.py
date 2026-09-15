from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from fractions import Fraction

from app.domain import Rank


SOURCE_ID = "approved-counting-systems-2026-09-12"
SOURCE_PATH = "research/sources/approved-counting-systems.md"
SOURCE_SHA256 = "343d59fc6f988e3a711ff16d184531af619774564511eaad63802cd034b91447"
SOURCE_TITLE = (
    "Free Learning Path for Wong Halves, Zen Count, Omega II, "
    "Ace Side Counting, and Hi-Lo"
)


class AceClassification(str, Enum):
    RECKONED = "ace_reckoned"
    NEUTRAL = "ace_neutral"


class UnknownResearchDefinitionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class SourceReference:
    source_id: str
    title: str
    local_path: str
    sha256: str
    locator: str

    def __post_init__(self) -> None:
        if not all(
            isinstance(value, str) and value.strip()
            for value in (
                self.source_id,
                self.title,
                self.local_path,
                self.sha256,
                self.locator,
            )
        ):
            raise ValueError("source reference fields must be nonempty strings")


@dataclass(frozen=True, slots=True)
class PublishedResearchMetrics:
    playing_efficiency: Decimal
    betting_correlation: Decimal
    insurance_correlation: Decimal

    def __post_init__(self) -> None:
        for value in (
            self.playing_efficiency,
            self.betting_correlation,
            self.insurance_correlation,
        ):
            if not isinstance(value, Decimal):
                raise TypeError("published research metrics must use Decimal")
            if not Decimal("0") <= value <= Decimal("1"):
                raise ValueError("published research metrics must be between zero and one")


@dataclass(frozen=True, slots=True)
class ResearchDefinition:
    identifier: str
    label: str
    tags: tuple[tuple[Rank, Fraction], ...]
    balanced: bool
    level: int
    ace_classification: AceClassification
    source: SourceReference
    published_metrics: PublishedResearchMetrics

    def __post_init__(self) -> None:
        if not self.identifier or not self.label:
            raise ValueError("definition identifier and label must be nonempty")
        if not isinstance(self.tags, tuple):
            raise TypeError("definition tags must be an immutable tuple")
        if not isinstance(self.balanced, bool):
            raise TypeError("balanced must be a boolean")
        if isinstance(self.level, bool) or not isinstance(self.level, int):
            raise TypeError("level must be an integer")
        if not isinstance(self.ace_classification, AceClassification):
            raise TypeError("ace_classification must be an AceClassification")
        if not isinstance(self.source, SourceReference):
            raise TypeError("source must be a SourceReference")
        if not isinstance(self.published_metrics, PublishedResearchMetrics):
            raise TypeError("published_metrics must be PublishedResearchMetrics")

        ranks = tuple(rank for rank, _ in self.tags)
        if len(ranks) != len(Rank) or set(ranks) != set(Rank):
            raise ValueError("definition tags must cover every Rank exactly once")
        if any(not isinstance(rank, Rank) for rank in ranks):
            raise TypeError("definition tag keys must be Rank values")
        if any(not isinstance(tag, Fraction) for _, tag in self.tags):
            raise TypeError("definition tags must use Fraction values")
        ten_tag = self.tag_for(Rank.TEN)
        if any(
            self.tag_for(rank) != ten_tag
            for rank in (Rank.JACK, Rank.QUEEN, Rank.KING)
        ):
            raise ValueError("10, J, Q, and K must share one ten-valued tag")

    def tag_for(self, rank: Rank) -> Fraction:
        if not isinstance(rank, Rank):
            raise TypeError("rank must be a Rank")
        for candidate, tag in self.tags:
            if candidate is rank:
                return tag
        raise ValueError(f"definition has no tag for rank {rank.value}")

    @property
    def one_deck_tag_sum(self) -> Fraction:
        return sum((tag * 4 for _, tag in self.tags), start=Fraction(0))


@dataclass(frozen=True, slots=True)
class AceAuxiliaryDefinition:
    identifier: str
    label: str
    source: SourceReference
    description: str


def _source(locator: str) -> SourceReference:
    return SourceReference(
        source_id=SOURCE_ID,
        title=SOURCE_TITLE,
        local_path=SOURCE_PATH,
        sha256=SOURCE_SHA256,
        locator=locator,
    )


def _tags(values: tuple[Fraction, ...]) -> tuple[tuple[Rank, Fraction], ...]:
    if len(values) != 10:
        raise ValueError("source vector must contain A through 9 and ten-valued tag")
    expanded = values[:9] + (values[9],) * 4
    return tuple(zip(tuple(Rank), expanded, strict=True))


HI_LO = ResearchDefinition(
    identifier="hi_lo",
    label="Hi-Lo",
    tags=_tags(
        (
            Fraction(-1),
            Fraction(1),
            Fraction(1),
            Fraction(1),
            Fraction(1),
            Fraction(1),
            Fraction(0),
            Fraction(0),
            Fraction(0),
            Fraction(-1),
        )
    ),
    balanced=True,
    level=1,
    ace_classification=AceClassification.RECKONED,
    source=_source(
        "Comparison and technical baseline table; "
        "System-by-system source guide: Hi-Lo"
    ),
    published_metrics=PublishedResearchMetrics(
        playing_efficiency=Decimal("0.51"),
        betting_correlation=Decimal("0.97"),
        insurance_correlation=Decimal("0.76"),
    ),
)


WONG_HALVES = ResearchDefinition(
    identifier="wong_halves",
    label="Wong Halves",
    tags=_tags(
        (
            Fraction(-1),
            Fraction(1, 2),
            Fraction(1),
            Fraction(1),
            Fraction(3, 2),
            Fraction(1),
            Fraction(1, 2),
            Fraction(0),
            Fraction(-1, 2),
            Fraction(-1),
        )
    ),
    balanced=True,
    level=3,
    ace_classification=AceClassification.RECKONED,
    source=_source(
        "Comparison and technical baseline table; "
        "System-by-system source guide: Wong Halves"
    ),
    published_metrics=PublishedResearchMetrics(
        playing_efficiency=Decimal("0.56"),
        betting_correlation=Decimal("0.99"),
        insurance_correlation=Decimal("0.72"),
    ),
)

ZEN_COUNT = ResearchDefinition(
    identifier="zen_count",
    label="Zen Count",
    tags=_tags(
        (
            Fraction(-1),
            Fraction(1),
            Fraction(1),
            Fraction(2),
            Fraction(2),
            Fraction(2),
            Fraction(1),
            Fraction(0),
            Fraction(0),
            Fraction(-2),
        )
    ),
    balanced=True,
    level=2,
    ace_classification=AceClassification.RECKONED,
    source=_source(
        "Comparison and technical baseline table; "
        "System-by-system source guide: Zen Count"
    ),
    published_metrics=PublishedResearchMetrics(
        playing_efficiency=Decimal("0.63"),
        betting_correlation=Decimal("0.96"),
        insurance_correlation=Decimal("0.85"),
    ),
)

OMEGA_II = ResearchDefinition(
    identifier="omega_ii",
    label="Omega II",
    tags=_tags(
        (
            Fraction(0),
            Fraction(1),
            Fraction(1),
            Fraction(2),
            Fraction(2),
            Fraction(2),
            Fraction(1),
            Fraction(0),
            Fraction(-1),
            Fraction(-2),
        )
    ),
    balanced=True,
    level=2,
    ace_classification=AceClassification.NEUTRAL,
    source=_source(
        "Comparison and technical baseline table; "
        "System-by-system source guide: Omega II"
    ),
    published_metrics=PublishedResearchMetrics(
        playing_efficiency=Decimal("0.67"),
        betting_correlation=Decimal("0.92"),
        insurance_correlation=Decimal("0.85"),
    ),
)

APPROVED_PRIMARY_DEFINITIONS: tuple[ResearchDefinition, ...] = (
    HI_LO,
    WONG_HALVES,
    ZEN_COUNT,
    OMEGA_II,
)

_DEFINITIONS_BY_ID = {
    definition.identifier: definition for definition in APPROVED_PRIMARY_DEFINITIONS
}
if len(_DEFINITIONS_BY_ID) != len(APPROVED_PRIMARY_DEFINITIONS):
    raise ValueError("research definition identifiers must be unique")
for _definition in APPROVED_PRIMARY_DEFINITIONS:
    if _definition.balanced and _definition.one_deck_tag_sum != 0:
        raise ValueError(
            f"balanced definition {_definition.identifier} must sum to zero"
        )


ACE_INFORMATION = AceAuxiliaryDefinition(
    identifier="ace_information",
    label="Ace Information",
    source=_source("Ace Side Counting: expert auxiliary technique"),
    description=(
        "Descriptive ace inventory retained separately from a primary research score."
    ),
)


def get_primary_definition(identifier: str) -> ResearchDefinition:
    try:
        return _DEFINITIONS_BY_ID[identifier]
    except KeyError as error:
        raise UnknownResearchDefinitionError(
            f"Unsupported primary research definition: {identifier}"
        ) from error
