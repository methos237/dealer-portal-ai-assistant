"""Heading-aware chunking of Markdown and PDF text.

Token counts are approximated as whitespace-separated words * 1.3 (English prose averages about
1.3 BPE tokens per word), so an 800-token window is ~615 words and a 100-token overlap is ~75 words.
"""

import re
from dataclasses import dataclass, field

WINDOW_TOKENS = 800
OVERLAP_TOKENS = 100
TOKENS_PER_WORD = 1.3
WINDOW_WORDS = int(WINDOW_TOKENS / TOKENS_PER_WORD)
OVERLAP_WORDS = int(OVERLAP_TOKENS / TOKENS_PER_WORD)

_HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")


@dataclass
class Chunk:
    text: str
    metadata: dict = field(default_factory=dict)  # title, section, page


def approx_tokens(text: str) -> int:
    return int(len(text.split()) * TOKENS_PER_WORD)


def _windows(words: list[str]) -> list[list[str]]:
    if len(words) <= WINDOW_WORDS:
        return [words] if words else []
    out, start, step = [], 0, WINDOW_WORDS - OVERLAP_WORDS
    while start < len(words):
        out.append(words[start : start + WINDOW_WORDS])
        if start + WINDOW_WORDS >= len(words):
            break
        start += step
    return out


def chunk_markdown(text: str, title: str) -> list[Chunk]:
    """Split on headings, keep the heading path as context, then window long sections."""
    sections: list[tuple[list[str], list[str]]] = []  # (heading path, lines)
    path: list[str] = []
    lines: list[str] = []
    for line in text.splitlines():
        m = _HEADING.match(line)
        if m:
            if lines:
                sections.append((path.copy(), lines))
            level, heading = len(m.group(1)), m.group(2)
            path = path[: level - 1] + [heading]
            lines = []
        else:
            lines.append(line)
    if lines:
        sections.append((path.copy(), lines))

    chunks: list[Chunk] = []
    for sec_path, sec_lines in sections:
        body = "\n".join(sec_lines).strip()
        if not body:
            continue
        section = " > ".join(sec_path[1:])  # drop the document title level
        prefix = f"{title}" + (f" — {section}" if section else "")
        for window in _windows(body.split()):
            chunks.append(
                Chunk(
                    text=f"{prefix}\n\n{' '.join(window)}",
                    metadata={"title": title, "section": section},
                )
            )
    return chunks


def chunk_pdf_pages(pages: list[str], title: str) -> list[Chunk]:
    """PDF text has no reliable headings; window each page and record the page number."""
    chunks: list[Chunk] = []
    for page_no, page in enumerate(pages, start=1):
        for window in _windows(page.split()):
            chunks.append(
                Chunk(
                    text=f"{title} (page {page_no})\n\n{' '.join(window)}",
                    metadata={"title": title, "page": page_no},
                )
            )
    return chunks
