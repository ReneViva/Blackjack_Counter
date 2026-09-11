from enum import Enum


class Outcome(str, Enum):
    WIN = "win"
    PUSH = "push"
    LOSS = "loss"
