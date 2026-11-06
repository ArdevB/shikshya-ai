"""Shikshya AI service. Phase 1 only provides the health check; Phase 4 adds the features."""

from fastapi import FastAPI

app = FastAPI(title="Shikshya AI service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
