# Python Review Rules

## BLOCKER — request changes

- `python/mutable-default-argument` — **Mutable default arguments** (`def f(items=[])`) — shared across calls; use `None` + assign inside.
- `python/bare-except` — **Bare `except:` or `except Exception: pass`** — catch specific exceptions; never silence. Bare `except` also eats `KeyboardInterrupt`/`SystemExit`.
- `python/sql-string-interpolation` — **SQL built with f-strings/`%`/`.format` from external input** — parameterized queries only.
- `python/subprocess-shell-injection` — **`subprocess` with `shell=True`** on anything derived from external input; prefer list-form argv always.
- `python/dynamic-code-execution` — **`eval`/`exec`/`pickle.loads` on external data.**
- `python/blocking-in-async` — **Blocking calls inside `async def`**: `requests`, `time.sleep`, sync DB drivers — use `httpx`/`aiohttp`, `asyncio.sleep`, async drivers, or `run_in_executor`.
- `python/secrets-not-centralised` — **Secrets hardcoded or read ad hoc** — central config module, validated at startup.
- `python/call-in-default-argument` — **A function call as a default argument** (`def f(at=datetime.now())`,
  `def f(cache=make_cache())`). It runs once, at definition, so every call shares one stale timestamp or one
  mutable object. Default to `None` and call it inside. Not for framework markers built for this (FastAPI
  `Depends`/`Query`, pydantic `Field`, dataclass `field(...)`) or calls returning immutable values
  (`timedelta(...)`).
- `python/return-in-finally` — **`return`, `break` or `continue` inside `finally`.** It discards any exception
  raised in the `try`/`except`, so `charge()` raising `PaymentDeclined` still returns `{"ok": True}`. `finally`
  releases resources; move the jump out.

## HIGH

- `python/missing-type-hints` — Missing type hints on new public functions — new code is typed; assume mypy/pyright strict.
- `python/missing-context-manager` — Files/connections/locks without context managers (`with`) — leaks on exception paths.
- `python/module-level-mutable-state` — Module-level mutable state used as implicit singleton across requests (Lambda warm starts share it — intentional caching must be explicit and documented).
- `python/broad-except-in-loop` — Broad `except Exception` that logs and continues in loops — one poisoned item must not silently vanish; dead-letter or re-raise policy required.
- `python/naive-datetime` — Datetime handling: naive `datetime.now()` in new code — `datetime.now(timezone.utc)` and timezone-aware throughout.
- `python/assert-for-validation` — `assert` for runtime validation — stripped under `-O`; raise proper exceptions.
- `python/boto3-client-per-call` — Boto3 clients created per call inside handlers/loops — create at module scope (Lambda) or inject.
- `python/http-call-without-timeout` — Unbounded `requests`/`httpx` calls without timeout.
- `python/loop-variable-closure` — **A `lambda` or nested `def` created in a loop that reads the loop variable
  and runs after the iteration** (stored, registered, scheduled). Closures look the name up when called, so
  every one sees the last value — `[lambda: send(u) for u in users]` sends to the last user N times. Bind it at
  creation (`lambda u=u: …`, `functools.partial`).
- `python/zip-without-strict` — **`zip()` over two or more iterables without `strict=`.** It stops silently at
  the shortest, so `dict(zip(headers, row))` on a short CSV row drops columns. Pass `strict=True`, or
  `strict=False` where unequal lengths are intended. Not on Python below 3.10, or when one argument is infinite
  (`itertools.count`).
- `python/quadratic-accumulation` — **Building a sequence by copying it each step** — `sum(lists, [])`,
  `reduce(lambda a, b: a + b, lists)`, `acc = acc + [x]` or `acc = {**acc, k: v}` in a loop. Each step allocates
  a new container, so the work grows quadratically. Use `itertools.chain.from_iterable`, a comprehension, or
  mutate a local accumulator.
- `python/blanket-suppression` — **A `# type: ignore`, `# pyright: ignore` or `# noqa` with no error code.** It
  silences every error on the line, including ones introduced later — an `arg-type` bug added next month is
  hidden by an ignore meant for an untyped import. Name the code (`# type: ignore[import-untyped]`, `# noqa:
  F401`). In addition to `core/type-checker-suppression`: a ticket does not excuse a missing code.
- `python/error-log-without-traceback` — **`logger.error(...)` in an `except` block with no `exc_info=True` and
  no re-raise.** The traceback is lost, so a `KeyError` from any of a dozen reads logs as the same one-line
  message. Use `logger.exception(...)` or pass `exc_info=True`.
- `python/broad-exception-assertion` — **`pytest.raises(Exception)` / `assertRaises(Exception)` (or
  `BaseException`) with no `match=`.** The test passes on any error — a `TypeError` from a typo included — so it
  proves nothing about the behaviour it names. Assert the specific type, or add a non-empty `match=`.
- `python/module-patching` — **Patching by dotted import path in tests** — `patch("app.billing.client.post")`,
  `mocker.patch("…")`, `monkeypatch.setattr("pkg.mod.attr", …)`. The test replaces the import graph, so it stays
  green when the real wiring breaks and goes red on a harmless move. Inject the dependency and pass a faithful
  test implementation. Not `patch.object` on an injected collaborator, `patch.dict(os.environ)` or
  `monkeypatch.setenv`.

## SUGGESTION

- `python/prefer-typed-models` — Dataclasses/pydantic models over dict-shaped data crossing function boundaries.
- `python/prefer-pathlib` — `pathlib` over `os.path` string juggling in new code.
- `python/prefer-f-strings` — f-strings over `%`/`.format`.
- `python/prefer-comprehensions` — Comprehensions over `map`/`filter` with lambdas; but no nested comprehensions beyond two levels.
