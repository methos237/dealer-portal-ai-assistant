"""Stand-ins for anthropic.AsyncAnthropic: a scripted streaming tool runner. No network."""

import json
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


def usage(**kw):
    base = {
        "input_tokens": 1000,
        "output_tokens": 50,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }
    return NS(**{**base, **kw})


class Turn:
    """One model response: stream events, final message, and the runner's tool results."""

    def __init__(self, events, stop_reason="end_turn", tool_uses=(), tool_results=(), usage_=None):
        self.events = events
        self.stop_reason = stop_reason
        self.tool_uses = list(tool_uses)  # NS(type="tool_use", id, name, input)
        self.tool_results = list(tool_results)  # dicts: tool_result blocks
        self.usage = usage_ or usage()


class FakeStream:
    def __init__(self, turn: Turn):
        self.turn = turn

    def __aiter__(self):
        async def gen():
            for e in self.turn.events:
                yield e

        return gen()

    async def get_final_message(self):
        text_blocks = [{"type": "text", "text": ""}]
        for e in self.turn.events:
            if e.type == "content_block_delta" and e.delta.type == "text_delta":
                text_blocks[-1]["text"] += e.delta.text
        content = [NS(**b) for b in text_blocks] + self.turn.tool_uses
        return NS(stop_reason=self.turn.stop_reason, usage=self.turn.usage, content=content)


class FakeRunner:
    def __init__(self, turns: list[Turn]):
        self.turns = turns
        self.index = -1

    def __aiter__(self):
        async def gen():
            for i, t in enumerate(self.turns):
                self.index = i
                yield FakeStream(t)

        return gen()

    async def generate_tool_call_response(self):
        results = self.turns[self.index].tool_results
        return {"role": "user", "content": results} if results else None


class FakeAsyncAnthropic:
    def __init__(self, turns: list[Turn]):
        self.turns = turns
        self.requests: list[dict] = []
        self.beta = NS(messages=NS(tool_runner=self._tool_runner))

    def _tool_runner(self, **request):
        self.requests.append(request)
        return FakeRunner(self.turns)


def draft_result(tool_use_id: str, draft: dict) -> dict:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": [{"type": "text", "text": json.dumps(draft)}],
    }


def error_result(tool_use_id: str, message: str) -> dict:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "is_error": True,
        "content": [{"type": "text", "text": message}],
    }
