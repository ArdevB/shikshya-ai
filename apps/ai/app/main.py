"""Shikshya AI service: risk prediction, quiz generation and timetable generation."""

from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.documents import MAX_BYTES, UnreadableDocument, extract_text
from app.llm import LlmFailed, LlmNotConfigured, LlmUsage
from app.quiz import (
    GenerateRequest,
    QuizGenerationFailed,
    QuizQuestion,
    RegenerateRequest,
    generate_questions,
    regenerate_question,
)
from app.risk import RiskFeatures, RiskResult, predict
from app.security import require_internal_key
from timetable.solver import TimetableRequest, TimetableResult, solve

app = FastAPI(title="Shikshya AI service", version="0.4.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Everything except the health check needs the shared secret.
protected = APIRouter(dependencies=[Depends(require_internal_key)])


class RiskBatch(BaseModel):
    items: list[RiskFeatures] = Field(max_length=5000)


class RiskBatchResult(BaseModel):
    results: list[RiskResult]


@protected.post("/predict/risk")
def predict_one(features: RiskFeatures) -> RiskResult:
    return predict([features])[0]


@protected.post("/predict/risk/batch")
def predict_many(batch: RiskBatch) -> RiskBatchResult:
    return RiskBatchResult(results=predict(batch.items))


class QuizGenerated(BaseModel):
    questions: list[QuizQuestion]
    usage: LlmUsage


class QuizRegenerated(BaseModel):
    question: QuizQuestion
    usage: LlmUsage


def _llm_error(error: Exception) -> HTTPException:
    if isinstance(error, LlmNotConfigured):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED")
    if isinstance(error, QuizGenerationFailed):
        return HTTPException(status.HTTP_502_BAD_GATEWAY, "AI_INVALID_OUTPUT")
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "AI_UNAVAILABLE")


@protected.post("/quiz/generate")
def quiz_generate(request: GenerateRequest) -> QuizGenerated:
    try:
        questions, usage = generate_questions(request)
    except (LlmNotConfigured, LlmFailed, QuizGenerationFailed) as error:
        raise _llm_error(error) from error
    return QuizGenerated(questions=questions, usage=usage)


@protected.post("/quiz/regenerate")
def quiz_regenerate(request: RegenerateRequest) -> QuizRegenerated:
    try:
        question, usage = regenerate_question(request)
    except (LlmNotConfigured, LlmFailed, QuizGenerationFailed) as error:
        raise _llm_error(error) from error
    return QuizRegenerated(question=question, usage=usage)


class ExtractedText(BaseModel):
    text: str


@protected.post("/documents/extract")
async def documents_extract(file: Annotated[UploadFile, File()]) -> ExtractedText:
    data = await file.read(MAX_BYTES + 1)
    try:
        return ExtractedText(text=extract_text(data))
    except UnreadableDocument as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error


@protected.post("/timetable/generate")
def timetable_generate(request: TimetableRequest) -> TimetableResult:
    return solve(request)


app.include_router(protected)
