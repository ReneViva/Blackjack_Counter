from dataclasses import dataclass

from app.domain import DealerSoft17
from app.schemas import TableStateSchema


@dataclass(frozen=True, slots=True)
class ScenarioAssumptions:
    decks: int
    dealer_soft_17: DealerSoft17


@dataclass(frozen=True, slots=True)
class ConcreteScenario:
    assumptions: ScenarioAssumptions
    state: TableStateSchema


@dataclass(frozen=True, slots=True)
class ScenarioPlan:
    uncertainty: tuple[str, ...]
    scenarios: tuple[ConcreteScenario, ...]


def concrete_scenarios(state: TableStateSchema) -> ScenarioPlan:
    deck_values = (
        tuple(range(1, 9))
        if state.rules.decks is None
        else (state.rules.decks,)
    )
    soft_17_values = (
        (DealerSoft17.STAND, DealerSoft17.HIT)
        if state.rules.dealer_soft_17 is None
        else (state.rules.dealer_soft_17,)
    )
    uncertainty: list[str] = []
    if state.rules.decks is None:
        uncertainty.append("deck_count")
    if state.rules.dealer_soft_17 is None:
        uncertainty.append("dealer_soft_17")

    scenarios: list[ConcreteScenario] = []
    for decks in deck_values:
        for dealer_soft_17 in soft_17_values:
            concrete_rules = state.rules.model_copy(
                update={"decks": decks, "dealer_soft_17": dealer_soft_17}
            )
            scenarios.append(
                ConcreteScenario(
                    assumptions=ScenarioAssumptions(
                        decks=decks, dealer_soft_17=dealer_soft_17
                    ),
                    state=state.model_copy(update={"rules": concrete_rules}),
                )
            )
    return ScenarioPlan(
        uncertainty=tuple(uncertainty), scenarios=tuple(scenarios)
    )
