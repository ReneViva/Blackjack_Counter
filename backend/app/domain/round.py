from dataclasses import dataclass
from enum import Enum

from .hand import Hand
from .state import GameState


class RoundPhase(str, Enum):
    DEALER_CHECK = "dealer_check"
    PLAYER_TURNS = "player_turns"
    DEALER_TURN = "dealer_turn"
    ROUND_COMPLETE = "round_complete"


class PlayerAction(str, Enum):
    HIT = "hit"
    STAND = "stand"
    SPLIT = "split"
    DOUBLE = "double"
    SURRENDER = "surrender"


class HandStatus(str, Enum):
    ACTIVE = "active"
    STOOD = "stood"
    BUST = "bust"
    BLACKJACK = "blackjack"
    SURRENDERED = "surrendered"


class DealerCheckResult(str, Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    NO_BLACKJACK = "no_blackjack"
    BLACKJACK = "blackjack"


@dataclass(frozen=True, slots=True)
class PlayerHandState:
    seat: int
    hand: Hand
    status: HandStatus = HandStatus.ACTIVE
    split_depth: int = 0
    from_split_aces: bool = False
    decision_count: int = 0
    doubled: bool = False

    def __post_init__(self) -> None:
        if isinstance(self.seat, bool) or not isinstance(self.seat, int):
            raise TypeError("seat must be an integer")
        if not isinstance(self.hand, Hand):
            raise TypeError("hand must be a Hand")
        if not isinstance(self.status, HandStatus):
            raise TypeError("status must be a HandStatus value")
        if isinstance(self.split_depth, bool) or not isinstance(
            self.split_depth, int
        ):
            raise TypeError("split_depth must be an integer")
        if self.split_depth < 0:
            raise ValueError("split_depth cannot be negative")
        if not isinstance(self.from_split_aces, bool):
            raise TypeError("from_split_aces must be a boolean")
        if isinstance(self.decision_count, bool) or not isinstance(
            self.decision_count, int
        ):
            raise TypeError("decision_count must be an integer")
        if self.decision_count < 0:
            raise ValueError("decision_count cannot be negative")
        if not isinstance(self.doubled, bool):
            raise TypeError("doubled must be a boolean")


@dataclass(frozen=True, slots=True)
class RoundState:
    game_state: GameState
    player_hands: tuple[PlayerHandState, ...]
    phase: RoundPhase
    active_hand_index: int | None
    dealer_check_result: DealerCheckResult

    def __post_init__(self) -> None:
        if not isinstance(self.game_state, GameState):
            raise TypeError("game_state must be a GameState")
        if not isinstance(self.player_hands, tuple):
            raise TypeError("player_hands must be a tuple")
        if not all(
            isinstance(hand, PlayerHandState) for hand in self.player_hands
        ):
            raise TypeError("player_hands must contain PlayerHandState values")
        if not isinstance(self.phase, RoundPhase):
            raise TypeError("phase must be a RoundPhase value")
        if self.active_hand_index is not None and (
            isinstance(self.active_hand_index, bool)
            or not isinstance(self.active_hand_index, int)
        ):
            raise TypeError("active_hand_index must be an integer or None")
        if not isinstance(self.dealer_check_result, DealerCheckResult):
            raise TypeError(
                "dealer_check_result must be a DealerCheckResult value"
            )
