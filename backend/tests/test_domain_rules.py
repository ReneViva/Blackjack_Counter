from dataclasses import FrozenInstanceError

import pytest

from app.domain import DealerSoft17, Rules


def test_dealer_soft_17_values_are_complete() -> None:
    assert tuple(value.value for value in DealerSoft17) == ("hit", "stand")


@pytest.mark.parametrize("decks", range(1, 9))
@pytest.mark.parametrize("dealer_soft_17", tuple(DealerSoft17))
def test_rules_accept_supported_values(
    decks: int,
    dealer_soft_17: DealerSoft17,
) -> None:
    rules = Rules(decks=decks, dealer_soft_17=dealer_soft_17)

    assert rules.decks == decks
    assert rules.dealer_soft_17 is dealer_soft_17


@pytest.mark.parametrize("decks", (-1, 0, 9))
def test_rules_reject_out_of_range_deck_counts(decks: int) -> None:
    with pytest.raises(ValueError):
        Rules(decks=decks, dealer_soft_17=DealerSoft17.STAND)


@pytest.mark.parametrize("decks", (True, 1.0, "1"))
def test_rules_reject_non_integer_deck_counts(decks: object) -> None:
    with pytest.raises(TypeError):
        Rules(decks=decks, dealer_soft_17=DealerSoft17.STAND)  # type: ignore[arg-type]


def test_rules_reject_non_enum_soft_17_values() -> None:
    with pytest.raises(TypeError):
        Rules(decks=6, dealer_soft_17="stand")  # type: ignore[arg-type]


def test_rules_have_no_undocumented_defaults() -> None:
    with pytest.raises(TypeError):
        Rules()  # type: ignore[call-arg]


def test_rules_are_immutable_hashable_values() -> None:
    rules = Rules(decks=6, dealer_soft_17=DealerSoft17.STAND)
    equivalent = Rules(decks=6, dealer_soft_17=DealerSoft17.STAND)

    assert rules == equivalent
    assert hash(rules) == hash(equivalent)

    with pytest.raises(FrozenInstanceError):
        rules.decks = 8  # type: ignore[misc]
