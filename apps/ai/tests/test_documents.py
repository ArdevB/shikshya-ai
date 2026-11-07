import io

from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter


def upload(client: TestClient, data: bytes, name: str = "notes.bin"):
    return client.post("/documents/extract", files={"file": (name, data)})


def test_plain_text(client: TestClient) -> None:
    response = upload(client, b"Attendance must be 75%.")
    assert response.json()["text"] == "Attendance must be 75%."


def test_word_document(client: TestClient) -> None:
    document = Document()
    document.add_paragraph("The library closes at 8 pm.")
    buffer = io.BytesIO()
    document.save(buffer)
    assert "library closes" in upload(client, buffer.getvalue()).json()["text"]


def test_the_contents_decide_the_type_not_the_name(client: TestClient) -> None:
    response = upload(client, b"\x00\x01\x02\xff\xfe binary", "notes.txt")
    assert response.status_code == 422


def test_a_pdf_with_no_text_explains_itself(client: TestClient) -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    response = upload(client, buffer.getvalue())
    assert response.status_code == 422
    assert "scanned" in response.json()["detail"]


def test_a_damaged_pdf_explains_itself(client: TestClient) -> None:
    assert upload(client, b"%PDF-1.7 this is not really a pdf").status_code == 422


def test_an_empty_file_explains_itself(client: TestClient) -> None:
    assert upload(client, b"   ").status_code == 422
