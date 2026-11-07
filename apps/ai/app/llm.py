"""The one place this service calls Gemini, so tests can replace it and usage is always reported."""

import time

from google import genai
from pydantic import BaseModel

from app.config import gemini_api_key, llm_model


class LlmNotConfigured(RuntimeError):
    """No GEMINI_API_KEY is set."""


class LlmFailed(RuntimeError):
    """Gemini refused the request or could not be reached."""


class LlmUsage(BaseModel):
    model: str
    inputTokens: int | None = None  # noqa: N815 - the JSON the API reads is camelCase
    outputTokens: int | None = None  # noqa: N815
    latencyMs: int = 0  # noqa: N815


def generate_json(prompt: str, schema: dict) -> tuple[str, LlmUsage]:
    """Asks for JSON matching a schema, and returns the text as Gemini wrote it, unvalidated."""
    api_key = gemini_api_key()
    if not api_key:
        raise LlmNotConfigured("GEMINI_API_KEY is not set")

    model = llm_model()
    started = time.monotonic()
    try:
        # Kept in a "with" for the whole call. The SDK closes a client as soon as nothing refers to
        # it, and client.interactions does not count, so an unnamed client is closed too early.
        with genai.Client(api_key=api_key) as client:
            interaction = client.interactions.create(
                model=model,
                input=prompt,
                # Nothing needs to be continued later, so Google has no reason to keep it.
                store=False,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": schema,
                },
            )
    except Exception as error:  # The SDK raises many types. All of them mean the same thing here.
        raise LlmFailed(str(error)) from error

    usage = getattr(interaction, "usage", None)
    return interaction.output_text or "", LlmUsage(
        model=model,
        inputTokens=getattr(usage, "total_input_tokens", None),
        outputTokens=getattr(usage, "total_output_tokens", None),
        latencyMs=round((time.monotonic() - started) * 1000),
    )
