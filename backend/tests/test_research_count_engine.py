from fractions import Fraction

import pytest

from app.domain import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    Rank,
    Suit,
    UnknownCard,
    ValueOnlyCard,
)
from app.engine import build_table_state
from app.research import (
    APPROVED_PRIMARY_DEFINITIONS,
    ResearchDefinition,
    compare_table_research,
    get_primary_definition,
    score_observations,
    table_observations,
)
from app.schemas import TableStateSchema


# Independent engine golden values transcribed from the approved source's
# "Comparison and technical baseline" table. They do not use production tags.
ENGINE_GOLDEN = {
    "hi_lo": (
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
        Fraction(-1),
        Fraction(-1),
        Fraction(-1),
    ),
    "wong_halves": (
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
        Fraction(-1),
        Fraction(-1),
        Fraction(-1),
    ),
    "zen_count": (
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
        Fraction(-2),
        Fraction(-2),
        Fraction(-2),
    ),
    "omega_ii": (
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
        Fraction(-2),
        Fraction(-2),
        Fraction(-2),
    ),
}


def card(rank: Rank, suit: Suit = Suit.SPADES) -> Card:
    return Card(rank=rank, suit=suit)


@pytest.mark.parametrize("definition_id", tuple(ENGINE_GOLDEN))
@pytest.mark.parametrize("rank_index,rank", tuple(enumerate(Rank)))
def test_every_single_rank_survives_generic_engine_exactly(
    definition_id: str, rank_index: int, rank: Rank
) -> None:
    result = score_observations(
        get_primary_definition(definition_id), (card(rank),)
    )

    assert result.score == ENGINE_GOLDEN[definition_id][rank_index]
    assert isinstance(result.score, Fraction)
    assert result.observed_known_cards == 1
    assert result.unresolved_unknown_cards == 0
    assert result.complete is True


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
@pytest.mark.parametrize("rank", tuple(Rank))
def test_suit_never_changes_a_research_tag(
    definition: ResearchDefinition, rank: Rank
) -> None:
    results = {
        score_observations(definition, (card(rank, suit),)).score for suit in Suit
    }

    assert len(results) == 1


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_all_ten_valued_cards_score_identically_through_engine(
    definition: ResearchDefinition,
) -> None:
    scores = {
        score_observations(definition, (card(rank),)).score
        for rank in (Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING)
    }

    assert len(scores) == 1


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_actual_domain_deck_scores_exactly_zero(
    definition: ResearchDefinition,
) -> None:
    independent_checksum = sum(
        (
            tag * 4
            for tag in ENGINE_GOLDEN[definition.identifier]
        ),
        start=Fraction(0),
    )
    result = score_observations(definition, ALL_CARDS)

    assert independent_checksum == Fraction(0)
    assert result.score == independent_checksum
    assert result.observed_known_cards == 52
    assert result.complete is True


@pytest.mark.parametrize("deck_count", range(1, 9))
def test_hi_lo_complete_supported_multi_deck_shoe_scores_zero(
    deck_count: int,
) -> None:
    observations = ALL_CARDS * deck_count

    result = score_observations(
        get_primary_definition("hi_lo"), observations, deck_count=deck_count
    )

    assert result.score == Fraction(0)
    assert result.observed_known_cards == 52 * deck_count
    assert result.complete is True


MULTI_CARD_CASES = (
    ("hi_lo", (Rank.TWO, Rank.FIVE), Fraction(2), "positive"),
    ("hi_lo", (Rank.ACE, Rank.TEN), Fraction(-2), "negative"),
    ("hi_lo", (Rank.SEVEN, Rank.NINE), Fraction(0), "zero"),
    ("hi_lo", (Rank.SIX, Rank.SIX), Fraction(2), "repeated"),
    (
        "hi_lo",
        (Rank.TWO, Rank.FIVE, Rank.SEVEN, Rank.TEN, Rank.ACE),
        Fraction(0),
        "mixed_known_sequence",
    ),
    ("wong_halves", (Rank.FIVE,), Fraction(3, 2), "positive"),
    ("wong_halves", (Rank.ACE, Rank.TEN), Fraction(-2), "negative"),
    ("wong_halves", (Rank.TWO, Rank.NINE), Fraction(0), "zero"),
    ("wong_halves", (Rank.FIVE, Rank.FIVE), Fraction(3), "repeated"),
    (
        "wong_halves",
        (Rank.ACE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING),
        Fraction(-5),
        "mixed_ten_and_ace",
    ),
    ("zen_count", (Rank.FOUR, Rank.SEVEN), Fraction(3), "positive"),
    ("zen_count", (Rank.ACE, Rank.TEN), Fraction(-3), "negative"),
    ("zen_count", (Rank.EIGHT, Rank.NINE), Fraction(0), "zero"),
    ("zen_count", (Rank.FIVE, Rank.FIVE), Fraction(4), "repeated"),
    (
        "zen_count",
        (Rank.ACE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING),
        Fraction(-9),
        "mixed_ten_and_ace",
    ),
    ("omega_ii", (Rank.FOUR, Rank.SEVEN), Fraction(3), "positive"),
    ("omega_ii", (Rank.NINE, Rank.TEN), Fraction(-3), "negative"),
    ("omega_ii", (Rank.ACE, Rank.EIGHT), Fraction(0), "zero"),
    ("omega_ii", (Rank.FIVE, Rank.FIVE), Fraction(4), "repeated"),
    (
        "omega_ii",
        (Rank.ACE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING),
        Fraction(-8),
        "mixed_ten_and_ace",
    ),
)


@pytest.mark.parametrize(
    "definition_id,ranks,expected,case_name",
    MULTI_CARD_CASES,
    ids=[f"{item[0]}-{item[3]}" for item in MULTI_CARD_CASES],
)
def test_hand_calculated_sequences(
    definition_id: str,
    ranks: tuple[Rank, ...],
    expected: Fraction,
    case_name: str,
) -> None:
    observations = tuple(card(rank) for rank in ranks)

    assert case_name
    assert score_observations(
        get_primary_definition(definition_id), observations
    ).score == expected


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_empty_observation_is_neutral_and_repeatable(
    definition: ResearchDefinition,
) -> None:
    first = score_observations(definition, ())
    second = score_observations(definition, ())

    assert first == second
    assert first.score == Fraction(0)
    assert first.observed_known_cards == 0
    assert first.complete is True


def test_hi_lo_observation_order_uses_one_authoritative_stream() -> None:
    observations = (
        card(Rank.TWO),
        ValueOnlyCard(BlackjackValueClass.FIVE),
        card(Rank.SEVEN),
        ValueOnlyCard(BlackjackValueClass.TEN),
        card(Rank.ACE),
    )

    forward = score_observations(get_primary_definition("hi_lo"), observations)
    reverse = score_observations(
        get_primary_definition("hi_lo"), tuple(reversed(observations))
    )

    assert forward.score == reverse.score == Fraction(0)
    assert forward.observed_known_cards == reverse.observed_known_cards == 5


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_unknown_observation_is_never_guessed(
    definition: ResearchDefinition,
) -> None:
    known = card(Rank.FIVE)
    expected_known_score = ENGINE_GOLDEN[definition.identifier][4]
    result = score_observations(definition, (known, UnknownCard()))

    assert result.score == expected_known_score
    assert result.observed_known_cards == 1
    assert result.unresolved_unknown_cards == 1
    assert result.complete is False


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
def test_ace_auxiliary_never_changes_primary_score(
    definition: ResearchDefinition,
) -> None:
    observations = (card(Rank.ACE), card(Rank.FIVE), card(Rank.TEN))
    without_auxiliary = score_observations(definition, observations)
    with_auxiliary = score_observations(
        definition,
        observations,
        deck_count=2,
        include_ace_information=True,
    )

    assert with_auxiliary.score == without_auxiliary.score
    assert with_auxiliary.ace_information is not None
    assert with_auxiliary.ace_information.known_aces_observed == 1
    assert with_auxiliary.ace_information.exact_aces_remaining == 7
    assert with_auxiliary.ace_information.complete is True


def test_unknown_card_makes_ace_inventory_incomplete() -> None:
    result = score_observations(
        get_primary_definition("omega_ii"),
        (card(Rank.ACE), UnknownCard()),
        deck_count=1,
        include_ace_information=True,
    )

    assert result.score == Fraction(0)
    assert result.ace_information is not None
    assert result.ace_information.known_aces_observed == 1
    assert result.ace_information.exact_aces_remaining is None
    assert result.ace_information.complete is False


def test_hi_lo_generic_ten_and_unknown_preserve_observation_precision() -> None:
    result = score_observations(
        get_primary_definition("hi_lo"),
        (ValueOnlyCard(BlackjackValueClass.TEN), UnknownCard()),
    )

    assert result.score == Fraction(-1)
    assert result.observed_known_cards == 1
    assert result.unresolved_unknown_cards == 1
    assert result.complete is False


def test_table_adapter_counts_each_observation_once() -> None:
    payload = TableStateSchema.model_validate(
        {
            "rules": {"decks": 1, "dealer_soft_17": "stand"},
            "dealer": {"cards": [{"kind": "known", "rank": "2", "suit": "S"}]},
            "players": [
                {
                    "seat": 1,
                    "is_user": True,
                    "cards": [{"kind": "known", "rank": "5", "suit": "H"}],
                }
            ],
            "discarded_cards": [
                {"kind": "known", "rank": "10", "suit": "D"}
            ],
        }
    )
    state = build_table_state(payload)

    assert len(table_observations(state)) == 3
    comparison = compare_table_research(state, ("wong_halves",))
    assert comparison.scores[0].score == Fraction(1)
    assert comparison.scores[0].observed_known_cards == 3


def test_separate_shoe_snapshot_does_not_retain_previous_score() -> None:
    definition = get_primary_definition("zen_count")
    populated = score_observations(definition, (card(Rank.FIVE),))
    fresh_shoe = score_observations(definition, ())

    assert populated.score == Fraction(2)
    assert fresh_shoe.score == Fraction(0)


def test_scoring_does_not_mutate_input_sequence() -> None:
    observations = [card(Rank.TWO), UnknownCard()]
    snapshot = tuple(observations)

    score_observations(get_primary_definition("wong_halves"), observations)

    assert tuple(observations) == snapshot


@pytest.mark.parametrize("definition", APPROVED_PRIMARY_DEFINITIONS)
@pytest.mark.parametrize(
    "value,rank",
    (
        (BlackjackValueClass.ACE, Rank.ACE),
        (BlackjackValueClass.TWO, Rank.TWO),
        (BlackjackValueClass.THREE, Rank.THREE),
        (BlackjackValueClass.FOUR, Rank.FOUR),
        (BlackjackValueClass.FIVE, Rank.FIVE),
        (BlackjackValueClass.SIX, Rank.SIX),
        (BlackjackValueClass.SEVEN, Rank.SEVEN),
        (BlackjackValueClass.EIGHT, Rank.EIGHT),
        (BlackjackValueClass.NINE, Rank.NINE),
        (BlackjackValueClass.TEN, Rank.QUEEN),
    ),
)
def test_value_only_observation_matches_equivalent_exact_research_tag(
    definition: ResearchDefinition,
    value: BlackjackValueClass,
    rank: Rank,
) -> None:
    generic = score_observations(definition, (ValueOnlyCard(value),))
    exact = score_observations(definition, (card(rank),))

    assert generic.score == exact.score
    assert generic.observed_known_cards == 1
    assert generic.unresolved_unknown_cards == 0
    assert generic.complete is True


def test_value_only_ace_contributes_to_ace_information() -> None:
    result = score_observations(
        get_primary_definition("omega_ii"),
        (ValueOnlyCard(BlackjackValueClass.ACE),),
        deck_count=2,
        include_ace_information=True,
    )

    assert result.ace_information is not None
    assert result.ace_information.known_aces_observed == 1
    assert result.ace_information.exact_aces_remaining == 7
    assert result.ace_information.complete is True


def test_table_research_scores_value_only_and_unknown_with_distinct_precision() -> None:
    state = build_table_state(
        TableStateSchema.model_validate(
            {
                "rules": {"decks": 1, "dealer_soft_17": "stand"},
                "dealer": {"cards": [{"kind": "value", "value": "5"}]},
                "players": [],
                "discarded_cards": [
                    {"kind": "value", "value": "10"},
                    {"kind": "unknown"},
                ],
            }
        )
    )

    score = compare_table_research(
        state,
        ("wong_halves",),
        include_ace_information=True,
    ).scores[0]

    assert score.score == Fraction(1, 2)
    assert score.observed_known_cards == 2
    assert score.unresolved_unknown_cards == 1
    assert score.complete is False
