# Browser / DOM Review Rules

**Scope:** browser code with no component framework — progressive-enhancement scripts,
widgets, embeds, web components, and anything talking to the DOM directly. A framework
repository does not install these rules: React, Angular, Vue and Svelte each close most
of these holes by default, and repeating them there is noise.

These are the failures a framework normally hides. Without one, they are the whole
attack surface.

## BLOCKER — request changes

- `dom/innerhtml-sink` — **`innerHTML` / `outerHTML` assigned anything not a hard-coded literal.** Concatenated markup around a variable is the sink, even when the variable "comes from our own API". Build nodes, or set `textContent`.

  ```js
  // WRONG
  el.innerHTML = `<a href="${url}">${name}</a>`;
  // RIGHT
  const a = document.createElement('a');
  a.href = url;          // still validate the scheme
  a.textContent = name;
  ```

- `dom/insert-adjacent-html-sink` — **`insertAdjacentHTML`, `document.write`, or `Range.createContextualFragment` on a built string.** Same sink as `innerHTML`, with less scrutiny.
- `dom/set-attribute-event-handler` — **`setAttribute` of an `on*` handler, or a `src`/`href` whose scheme is not checked.** `javascript:` and `data:text/html` both execute; an allow-list of `https:` (and `mailto:` where meant) is the check.
- `dom/postmessage-no-origin-check` — **A `message` listener that reads `event.data` without first comparing `event.origin` to an expected origin.** Any page that can get a handle to the window can post to it.

  ```js
  // WRONG
  window.addEventListener('message', (e) => apply(e.data));
  // RIGHT
  window.addEventListener('message', (e) => {
    if (e.origin !== TRUSTED_ORIGIN) return;
    apply(e.data);
  });
  ```

- `dom/postmessage-wildcard-target` — **`postMessage(data, '*')`.** The payload goes to whatever document currently occupies that frame. Name the target origin.
- `dom/url-input-into-sink` — **`location.hash`, `location.search` or a `data-*` attribute reaching markup, navigation or `eval` without validation.** It is the most attacker-controllable input a page has.
- `dom/open-redirect` — **`location.href` / `location.assign` / `window.open` given a user-supplied URL** with no same-origin or allow-list check.
- `dom/dynamic-script-injection` — **A `<script>` element whose `src` is built from external input**, or `new Function` / `eval` over fetched content.

## HIGH

- `dom/listener-never-removed` — `addEventListener` on `window`, `document` or a long-lived node with no matching `removeEventListener` (or `{ signal }`) when the widget is torn down. The handler keeps the whole closure alive and fires against detached state.
- `dom/observer-never-disconnected` — `IntersectionObserver`, `ResizeObserver`, `MutationObserver` or `matchMedia` listener created without a `disconnect()` path.
- `dom/timer-never-cleared` — `setInterval`/`setTimeout` retained past teardown.
- `dom/fetch-no-abort` — A `fetch` that can be superseded (search-as-you-type, tab switch, re-render) started without an `AbortController` — the stale response arrives last and wins.
- `dom/unparsed-json-boundary` — `JSON.parse` of a `data-*` attribute, a storage value or a response body with no `try`/`catch` and no shape check. All three are external input; a throw here takes the whole script down.
- `dom/layout-thrash` — Reading a layout property (`offsetHeight`, `getBoundingClientRect`) and writing a style in the same loop. Each pair forces a synchronous reflow; batch reads, then writes, inside `requestAnimationFrame`.
- `dom/document-wide-query-in-loop` — `document.querySelectorAll` (or `getElementById`) re-run per iteration or per event. Hoist the lookup; the DOM is not a cache.
- `dom/scroll-resize-unthrottled` — `scroll`, `resize`, `mousemove` or `pointermove` handlers doing layout or network work with no throttle and no `{ passive: true }` — this is jank you can measure.
- `dom/form-submit-not-prevented` — An `submit`/`click` handler doing async work without `preventDefault`, or preventing it without ever re-enabling the control — double submits or a permanently dead button.

## SUGGESTION

- `dom/prefer-event-delegation` — One delegated listener on a container over one per row for lists that change.
- `dom/prefer-classlist` — `classList.add`/`toggle` over string surgery on `className`.
- `dom/prefer-abort-signal-timeout` — `AbortSignal.timeout(ms)` over a manual `setTimeout` plus `controller.abort()`.
- `dom/prefer-target-blank-noopener` — `rel="noopener"` on `target="_blank"` links; also state it explicitly on `window.open`.
- `dom/prefer-dataset` — `el.dataset.x` over `getAttribute('data-x')`.
