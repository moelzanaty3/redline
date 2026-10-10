# DO NOT MERGE — Redline validation seed (anti-slop rules).
# Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher.
from datetime import datetime, timezone
from unittest.mock import patch
import pytest
# SEED 1 [HIGH] (python/blanket-suppression) blanket ignore with no error code
from legacy_billing import client  # type: ignore


# SEED 2 [BLOCKER] (python/call-in-default-argument) datetime.now() evaluated once at definition
def record_event(name: str, at: datetime = datetime.now(timezone.utc)) -> dict[str, object]:
    return {"name": name, "at": at.isoformat()}


def settle(order):
    try:
        client.charge(order)
    finally:
        # SEED 3 [BLOCKER] (python/return-in-finally) return in finally swallows the payment failure
        return {"ok": True}


callbacks = []
for tenant in ["a", "b"]:
    # SEED 4 [HIGH] (python/loop-variable-closure) every callback sees the last tenant
    callbacks.append(lambda: client.refresh(tenant))


def to_records(headers: list[str], rows: list[list[str]]) -> list[dict[str, str]]:
    # SEED 5 [HIGH] (python/zip-without-strict) a short row silently drops columns
    return [dict(zip(headers, row)) for row in rows]


def all_line_items(invoices):
    # SEED 6 [HIGH] (python/quadratic-accumulation) sum(..., []) copies the list at every step
    return sum((inv.line_items for inv in invoices), [])


def sync(account_id, logger):
    try:
        client.sync(account_id)
    except client.SyncError as e:
        # SEED 7 [HIGH] (python/error-log-without-traceback) traceback lost
        logger.error("sync failed: %s", e)


def test_rejects_negative_amount():
    # SEED 8 [HIGH] (python/broad-exception-assertion) passes on any error
    with pytest.raises(Exception):
        client.parse_amount("-1")


# SEED 9 [HIGH] (python/module-patching) patched by import path
@patch("app.orders.service.payments.charge", return_value={"ok": True})
def test_place_order(mock_charge):
    assert client.place_order({})["status"] == "placed"
