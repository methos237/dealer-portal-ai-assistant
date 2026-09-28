"""A stand-in for anthropic.Anthropic that replays scripted stream events. No network."""

from contextlib import contextmanager
from types import SimpleNamespace as NS


def text_start():
    return NS(type="content_block_start", index=0, content_block=NS(type="text", text=""))


def text(t: str):
    return NS(type="content_block_delta", index=0, delta=NS(type="text_delta", text=t))


def citation(cited: str, doc_index: int, title: str, start: int = 0, end: int = 10):
    return NS(
        type="content_block_delta",
        index=0,
        delta=NS(
            type="citations_delta",
            citation=NS(
                type="char_location",
                cited_text=cited,
                document_index=doc_index,
                document_title=title,
                start_char_index=start,
                end_char_index=end,
            ),
        ),
    )


class FakeAnthropic:
    def __init__(
        self, events: list, stop_reason: str = "end_turn", usage: dict | None = None
    ) -> None:
        self.events = events
        self.stop_reason = stop_reason
        self.usage = usage or {
            "input_tokens": 1200,
            "output_tokens": 80,
            "cache_read_input_tokens": 0,
        }
        self.requests: list[dict] = []
        self.messages = NS(stream=self._stream)

    @contextmanager
    def _stream(self, **request):
        self.requests.append(request)
        fake = self
        text_blocks = [{"type": "text", "text": ""}]
        for e in self.events:
            if e.type == "content_block_delta" and e.delta.type == "text_delta":
                text_blocks[-1]["text"] += e.delta.text

        class Stream:
            def __iter__(self):
                return iter(fake.events)

            def get_final_message(self):
                return NS(
                    stop_reason=fake.stop_reason,
                    usage=NS(cache_creation_input_tokens=0, **fake.usage),
                    content=[NS(**b) for b in text_blocks],
                )

        yield Stream()
