"""Only the Node API may call this service. It proves that with a shared secret."""

import secrets
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import internal_key


def require_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    expected = internal_key()
    # compare_digest takes the same time wherever the strings differ, so timing reveals nothing.
    if not expected or not x_internal_key or not secrets.compare_digest(x_internal_key, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid internal key")
