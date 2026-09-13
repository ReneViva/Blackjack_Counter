from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api import (
    analysis_router,
    player_actions_router,
    research_router,
    validation_router,
)


VITE_DEVELOPMENT_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["blackjack-analysis-api"]


app = FastAPI(
    title="Blackjack Analysis API",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(VITE_DEVELOPMENT_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)
app.include_router(validation_router)
app.include_router(player_actions_router)
app.include_router(analysis_router)
app.include_router(research_router)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="blackjack-analysis-api")
