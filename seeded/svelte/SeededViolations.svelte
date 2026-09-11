<!--
  DO NOT MERGE — Redline validation seed.
  Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
  citing that rule id. Score with scripts/score-seeds.mjs.

  Svelte 5, runes mode. A rune anywhere in a component puts the whole file in runes mode,
  where `$:` is a compile error — so the reactive-statement rule is seeded in
  SeededViolationsLegacy.svelte instead, which is a Svelte 4 component.
-->
<script module>
  // SEED 1 [BLOCKER] (svelte/module-context-shared-state) module-scope state shared by every instance and every SSR request
  let lastViewedAccount = { msisdn: '', reference: '' };
</script>

<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  // SEED 2 [BLOCKER] (svelte/private-env-in-shared-code) private env imported from a component, so it ships to the browser
  import { BILLING_API_SECRET } from '$env/static/private';

  // SEED 3 [BLOCKER] (core/hardcoded-secrets) fallback token committed in source
  const FALLBACK_TOKEN = 'ghp_acmeSeed0000000000000000000000000000';

  let { profile } = $props();
  let orders = $state([]);
  let total = $state(0);

  // SEED 4 [HIGH] (svelte/effect-for-derived-state) derived value computed in an effect instead of $derived
  $effect(() => {
    total = orders.length;
  });

  onMount(() => {
    // SEED 5 [HIGH] (svelte/effect-missing-cleanup) interval registered with no teardown returned
    setInterval(
      () =>
        fetch('/api/heartbeat', {
          headers: { authorization: `Bearer ${BILLING_API_SECRET ?? FALLBACK_TOKEN}` },
        }),
      5000
    );

    // SEED 6 [HIGH] (svelte/store-not-unsubscribed) manual subscribe whose unsubscriber is dropped
    page.subscribe((p) => {
      lastViewedAccount = { msisdn: profile.msisdn, reference: p.url.pathname };
    });
  });

  // SEED 7 [BLOCKER] (core/customer-data-in-logs) msisdn written to the console
  console.log('viewing', profile.msisdn);

  // SEED 8 [HIGH] (svelte/state-mutation-across-boundary) child writing to an object the parent owns
  function markSeen() {
    profile.seen = true;
  }
</script>

<!-- SEED 9 [BLOCKER] (svelte/html-tag-sink) unsanitised user html injected into the page -->
{@html profile.bio}

<ul>
  <!-- SEED 10 [HIGH] (svelte/each-missing-key) unkeyed each over a list that reorders -->
  {#each orders as order}
    <li>{order.reference}</li>
  {/each}
</ul>

<button onclick={markSeen}>seen ({total})</button>
