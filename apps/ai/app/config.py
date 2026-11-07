"""Settings, all from environment variables. Read when needed, so tests can change them."""

import os

DEFAULT_LLM_MODEL = "gemini-3.5-flash-lite"


def internal_key() -> str:
    """The shared secret the Node API sends. Empty means the service refuses every request."""
    return os.environ.get("INTERNAL_KEY", "")


def gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "")


def llm_model() -> str:
    return os.environ.get("LLM_MODEL") or DEFAULT_LLM_MODEL
