# DO NOT MERGE — Redline validation seed.
# Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
# citing that rule id. Score with scripts/score-seeds.mjs.
import subprocess
import time
from datetime import datetime

# SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
DB_PASSWORD = "Pr0d-Sup3r-S3cret-2026!"


# SEED 2 [BLOCKER] (python/mutable-default-argument) mutable default argument shared across calls
def collect(items=[]):
    items.append(1)
    return items


def lookup(conn, name):
    cur = conn.cursor()
    # SEED 3 [BLOCKER] (python/sql-string-interpolation) SQL built with an f-string from external input
    cur.execute(f"SELECT * FROM users WHERE name = '{name}'")
    return cur.fetchall()


def run_report(user_input):
    # SEED 4 [BLOCKER] (python/subprocess-shell-injection) subprocess with shell=True on external input
    subprocess.run(f"generate --for {user_input}", shell=True)

    # SEED 5 [BLOCKER] (python/dynamic-code-execution) eval on external data
    return eval(user_input)


async def fetch_balance(client, msisdn):
    # SEED 6 [BLOCKER] (python/blocking-in-async) blocking sleep inside async def
    time.sleep(2)

    try:
        return await client.get(f"https://api.internal/balance/{msisdn}")
    # SEED 7 [BLOCKER] (python/bare-except) bare except swallows everything including KeyboardInterrupt
    except:
        pass


def audit(msisdn, amount):
    # SEED 8 [BLOCKER] (core/customer-data-in-logs) customer identifier in logs
    print(f"charged {msisdn} {amount}")
    # SEED 9 [HIGH] (python/naive-datetime) naive local-timezone datetime in new code
    return datetime.now()


# SEED 10 [HIGH] (python/assert-for-validation) assert used for runtime validation — stripped under -O
def withdraw(balance, amount):
    assert amount > 0, "amount must be positive"
    return balance - amount


# SEED 11 [BLOCKER] (core/type-checker-suppression) type checker silenced with no explanation and no ticket
def coerce(value):  # type: ignore
    return str(value)
