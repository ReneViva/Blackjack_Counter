from .analysis import router as analysis_router
from .research import router as research_router
from .validation import router as validation_router
from .player_actions import router as player_actions_router

__all__ = [
    "analysis_router",
    "player_actions_router",
    "research_router",
    "validation_router",
]
