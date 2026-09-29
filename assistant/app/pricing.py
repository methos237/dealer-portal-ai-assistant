"""Pinned Anthropic list prices, USD per million tokens (first-party API, 2026-09-29).

Cache reads are 0.1x input (0.05x on Opus 5.5 and Sonnet 5.5), 5-minute cache writes 1.25x input.
Unknown models fall back to the assistant's default so a cost is always shown; bump this table when
ASSISTANT_MODEL changes.
"""

from app.agent import MODEL

PRICES: dict[str, dict[str, float]] = {
    "claude-opus-5": {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write": 6.25},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20, "cache_write": 5.00},
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-sonnet-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25},
}
USAGE_TO_PRICE = {
    "input_tokens": "input",
    "output_tokens": "output",
    "cache_read_input_tokens": "cache_read",
    "cache_creation_input_tokens": "cache_write",
}


def cost_usd(usage: dict, model: str | None = None) -> dict[str, float]:
    """Per-bucket and total cost of one usage record. input_tokens is the uncached part already."""
    prices = PRICES.get(model or usage.get("model") or MODEL) or PRICES[MODEL]
    parts = {
        bucket: round((usage.get(key) or 0) * prices[bucket] / 1_000_000, 6)
        for key, bucket in USAGE_TO_PRICE.items()
    }
    return {**parts, "total": round(sum(parts.values()), 6)}
