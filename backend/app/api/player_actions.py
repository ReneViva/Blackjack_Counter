from fastapi import APIRouter

from app.domain import HandStatus, PlayerHandState
from app.engine import build_table_state, split_action_decision, validate_table_state
from app.schemas import (
    LegalActionResponse,
    PlayerActionsRequest,
    PlayerActionsResponse,
)


router = APIRouter(prefix="/api", tags=["gameplay"])


def _response(
    allowed: bool, code: str | None, reason: str | None
) -> PlayerActionsResponse:
    return PlayerActionsResponse(
        split=LegalActionResponse(allowed=allowed, code=code, reason=reason)
    )


@router.post("/player-actions", response_model=PlayerActionsResponse)
def player_actions(payload: PlayerActionsRequest) -> PlayerActionsResponse:
    table = build_table_state(payload.state)
    validation = validate_table_state(table)
    if not validation.valid:
        issue = validation.errors[0]
        return _response(False, issue.code, issue.message)

    matching = tuple(
        player
        for player in table.players
        if player.seat == payload.target.seat
        and player.hand_id == payload.target.hand_id
    )
    if len(matching) != 1:
        return _response(
            False,
            "invalid_hand_target",
            "The selected player hand does not exist.",
        )

    selected = matching[0]
    hand = PlayerHandState(
        seat=selected.seat,
        hand=selected.hand,
        status=HandStatus.ACTIVE,
        split_depth=selected.split_depth,
        from_split_aces=selected.from_split_aces,
        decision_count=max(0, len(selected.hand.cards) - 2),
        hand_id=selected.hand_id,
        parent_hand_id=selected.parent_hand_id,
    )
    decision = split_action_decision(
        payload.state.rules,
        hand,
        sum(player.seat == selected.seat for player in table.players),
    )
    return _response(decision.allowed, decision.code, decision.message)
