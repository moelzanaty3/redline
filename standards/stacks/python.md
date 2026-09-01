# Python Review Rules

## BLOCKER — request changes

- `python/mutable-default-argument` — **Mutable default arguments** (`def f(items=[])`) — shared across calls; use `None` + assign inside.
- `python/bare-except` — **Bare `except:` or `except Exception: pass`** — catch specific exceptions; never silence. Bare `except` also eats `KeyboardInterrupt`/`SystemExit`.
- `python/sql-string-interpolation` — **SQL built with f-strings/`%`/`.format` from external input** — parameterized queries only.
- `python/subprocess-shell-injection` — **`subprocess` with `shell=True`** on anything derived from external input; prefer list-form argv always.
- `python/dynamic-code-execution` — **`eval`/`exec`/`pickle.loads` on external data.**
- `python/blocking-in-async` — **Blocking calls inside `async def`**: `requests`, `time.sleep`, sync DB drivers — use `httpx`/`aiohttp`, `asyncio.sleep`, async drivers, or `run_in_executor`.
- `python/secrets-not-centralised` — **Secrets hardcoded or read ad hoc** — central config module, validated at startup.

## HIGH

- `python/missing-type-hints` — Missing type hints on new public functions — new code is typed; assume mypy/pyright strict.
- `python/missing-context-manager` — Files/connections/locks without context managers (`with`) — leaks on exception paths.
- `python/module-level-mutable-state` — Module-level mutable state used as implicit singleton across requests (Lambda warm starts share it — intentional caching must be explicit and documented).
- `python/broad-except-in-loop` — Broad `except Exception` that logs and continues in loops — one poisoned item must not silently vanish; dead-letter or re-raise policy required.
- `python/naive-datetime` — Datetime handling: naive `datetime.now()` in new code — `datetime.now(timezone.utc)` and timezone-aware throughout.
- `python/assert-for-validation` — `assert` for runtime validation — stripped under `-O`; raise proper exceptions.
- `python/boto3-client-per-call` — Boto3 clients created per call inside handlers/loops — create at module scope (Lambda) or inject.
- `python/http-call-without-timeout` — Unbounded `requests`/`httpx` calls without timeout.

## SUGGESTION

- `python/prefer-typed-models` — Dataclasses/pydantic models over dict-shaped data crossing function boundaries.
- `python/prefer-pathlib` — `pathlib` over `os.path` string juggling in new code.
- `python/prefer-f-strings` — f-strings over `%`/`.format`.
- `python/prefer-comprehensions` — Comprehensions over `map`/`filter` with lambdas; but no nested comprehensions beyond two levels.
