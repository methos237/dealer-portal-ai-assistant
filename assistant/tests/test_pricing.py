from app.pricing import PRICES, cost_usd


def test_cost_uses_each_bucket_and_the_message_model() -> None:
    usage = {
        "input_tokens": 900,
        "output_tokens": 30,
        "cache_read_input_tokens": 850,
        "cache_creation_input_tokens": 1000,
        "model": "claude-opus-5",
    }
    c = cost_usd(usage)
    assert c["input"] == 0.0045
    assert c["output"] == 0.00075
    assert c["cache_read"] == 0.000425
    assert c["cache_write"] == 0.00625
    assert c["total"] == 0.011925


def test_unknown_model_falls_back_to_the_default_price() -> None:
    usage = {"input_tokens": 1_000_000, "model": "claude-unknown"}
    assert cost_usd(usage)["input"] == PRICES["claude-opus-5"]["input"]
