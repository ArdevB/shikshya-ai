"""Reads text out of the files teachers and admins upload. Checks the bytes, not the file name."""

import io
import zipfile

from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_BYTES = 15 * 1024 * 1024


class UnreadableDocument(ValueError):
    """The message is safe to show to the person who uploaded the file."""


def _kind(data: bytes) -> str:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    return "docx"
        except zipfile.BadZipFile as error:
            raise UnreadableDocument("This file looks damaged.") from error
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise UnreadableDocument("Please upload a PDF, Word (.docx) or text file.") from error
    return "text"


def extract_text(data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise UnreadableDocument("This file is larger than the 15 MB limit.")

    kind = _kind(data)
    try:
        if kind == "pdf":
            pages = [page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages]
            text = "\n\n".join(pages)
        elif kind == "docx":
            document = Document(io.BytesIO(data))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        else:
            text = data.decode("utf-8")
    except (PdfReadError, ValueError, KeyError) as error:
        raise UnreadableDocument("This file could not be read.") from error

    text = text.strip()
    if not text:
        # A scanned PDF is pictures of pages, with no text inside it to read.
        raise UnreadableDocument("No text found in this file. Is it a scanned document?")
    return text
