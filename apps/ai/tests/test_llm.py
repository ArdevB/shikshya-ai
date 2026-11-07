"""
Runs the real Gemini SDK against a small stand-in server, with no network and no key.

The other tests replace generate_json with a fake, which is right for testing what happens to its
answer but says nothing about the SDK call itself. A client closed too early once got past all of
them, and only showed up against the real thing.
"""

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import llm
from app.llm import LlmFailed

SCHEMA = {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"]}
ANSWER = '{"a": "OK"}'

# The shape Gemini really sends, copied from a real reply.
COMPLETED = {
    "id": "",
    "object": "interaction",
    "status": "completed",
    "model": "test-model",
    "created": "2026-11-07T12:37:51Z",
    "updated": "2026-11-07T12:37:51Z",
    "output_text": ANSWER,
    "steps": [{"type": "model_output", "content": [{"type": "text", "text": ANSWER}]}],
    "usage": {"total_input_tokens": 3, "total_output_tokens": 11, "total_tokens": 14},
}


class StandInGemini(ThreadingHTTPServer):
    reply: dict = COMPLETED
    reply_status: int = 200
    received: list[dict]


class Handler(BaseHTTPRequestHandler):
    server: StandInGemini

    def do_POST(self) -> None:
        length = int(self.headers["Content-Length"])
        self.server.received.append(json.loads(self.rfile.read(length)))
        body = json.dumps(self.server.reply).encode()
        self.send_response(self.server.reply_status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        """Keeps the test output quiet."""


@pytest.fixture
def gemini(monkeypatch: pytest.MonkeyPatch) -> Iterator[StandInGemini]:
    server = StandInGemini(("127.0.0.1", 0), Handler)
    server.received = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("GEMINI_API_KEY", "not-a-real-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setenv("GOOGLE_GEMINI_BASE_URL", f"http://127.0.0.1:{server.server_address[1]}")
    yield server
    server.shutdown()
    server.server_close()
    thread.join()


def test_the_request_reaches_gemini_and_the_answer_comes_back(gemini: StandInGemini) -> None:
    text, usage = llm.generate_json("Say OK", SCHEMA)

    assert text == ANSWER
    assert usage.model == "test-model"
    assert usage.inputTokens == 3
    assert usage.outputTokens == 11


def test_the_request_asks_for_json_and_for_nothing_to_be_kept(gemini: StandInGemini) -> None:
    llm.generate_json("Say OK", SCHEMA)

    request = gemini.received[0]
    assert request["model"] == "test-model"
    assert request["input"] == "Say OK"
    assert request["store"] is False
    assert request["response_format"]["mime_type"] == "application/json"
    assert request["response_format"]["schema"] == SCHEMA


def test_gemini_refusing_the_request_becomes_a_clean_failure(gemini: StandInGemini) -> None:
    gemini.reply_status = 400
    gemini.reply = {"error": {"code": 400, "message": "API key not valid"}}

    with pytest.raises(LlmFailed, match="API key not valid"):
        llm.generate_json("Say OK", SCHEMA)
