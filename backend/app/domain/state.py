from dataclasses import dataclass, field

from .hand import Hand
from .rules import Rules
from .shoe import Shoe


@dataclass(frozen=True, slots=True)
class GameState:
    rules: Rules
    shoe: Shoe
    dealer_hand: Hand = field(default_factory=Hand)
    player_hands: tuple[Hand, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.rules, Rules):
            raise TypeError("rules must be Rules")
        if not isinstance(self.shoe, Shoe):
            raise TypeError("shoe must be a Shoe")
        if not isinstance(self.dealer_hand, Hand):
            raise TypeError("dealer_hand must be a Hand")
        if not isinstance(self.player_hands, tuple):
            raise TypeError("player_hands must be a tuple")
        if not all(isinstance(hand, Hand) for hand in self.player_hands):
            raise TypeError("player_hands must contain only Hand values")
        if self.rules.decks != self.shoe.decks:
            raise ValueError("rules and shoe must use the same deck count")
