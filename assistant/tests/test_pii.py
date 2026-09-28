import logging

from app.pii import RedactingFilter, redact


def test_redacts_email_phone_and_vin() -> None:
    text = "Customer dana@example.com called (828) 555-0142 about 1THRA24X0RN000001 and 555-0100."
    assert redact(text) == "Customer [email] called [phone] about [vin] and 555-0100."


def test_filter_redacts_formatted_log_records(caplog) -> None:
    logger = logging.getLogger("test.pii")
    logger.addFilter(RedactingFilter())
    with caplog.at_level(logging.INFO, logger="test.pii"):
        logger.info("user %s asked about %s", "lee@lakeshore.example", "1THRS36X4RN000004")
    assert caplog.records[-1].getMessage() == "user [email] asked about [vin]"
