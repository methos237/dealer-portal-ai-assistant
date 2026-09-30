from rag.chunking import OVERLAP_WORDS, WINDOW_WORDS, chunk_markdown, chunk_pdf_pages

DOC = """# Aria Owners Manual

Intro paragraph.

## Warranty

Covered for 36 months.

### Exclusions

Tires are excluded.

## Empty section
"""


def test_markdown_splits_on_headings_and_keeps_section_path() -> None:
    chunks = chunk_markdown(DOC, "Aria Owners Manual")
    sections = [c.metadata["section"] for c in chunks]
    assert sections == ["", "Warranty", "Warranty > Exclusions"]
    assert chunks[2].text.startswith("Aria Owners Manual — Warranty > Exclusions")
    assert "Tires are excluded." in chunks[2].text
    assert all(c.metadata["title"] == "Aria Owners Manual" for c in chunks)


def test_long_section_is_windowed_with_overlap() -> None:
    words = [f"w{i}" for i in range(WINDOW_WORDS * 2 + 10)]
    chunks = chunk_markdown("# T\n\n## S\n\n" + " ".join(words), "T")
    assert len(chunks) == 3
    first, second = (
        chunks[0].text.split("\n\n", 1)[1].split(),
        chunks[1].text.split("\n\n", 1)[1].split(),
    )
    assert len(first) == WINDOW_WORDS
    assert first[-OVERLAP_WORDS:] == second[:OVERLAP_WORDS]
    assert chunks[-1].text.split()[-1] == words[-1]


def test_pdf_pages_carry_page_numbers() -> None:
    chunks = chunk_pdf_pages(["page one text", "", "page three text"], "Manual")
    assert [c.metadata["page"] for c in chunks] == [1, 3]
    assert chunks[1].text.startswith("Manual (page 3)")


def test_markdown_without_h1_keeps_top_level_section_names() -> None:
    chunks = chunk_markdown(
        "## Warranty\n\nThree years.\n\n## Awning\n\nRetract in wind.\n", "Export"
    )
    assert [c.metadata["section"] for c in chunks] == ["Warranty", "Awning"]
