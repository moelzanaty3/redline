<!--
  DO NOT MERGE — Redline validation seed.
  Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
  citing that rule id. Score with scripts/score-seeds.mjs.

  Svelte 4 syntax deliberately: `$:` and `export let` cannot appear in a component that
  uses runes, and both are still what most onboarded Svelte code looks like.
-->
<script>
  import { onDestroy } from 'svelte';
  import { cartStore } from '$lib/stores/cart';

  export let profile;
  export let query = '';

  let results = [];
  let total = 0;

  // SEED 1 [HIGH] (svelte/reactive-statement-side-effect) a reactive block performing a fetch
  $: if (query) {
    fetch(`/api/search?q=${query}`)
      .then((r) => r.json())
      .then((r) => (results = r));
  }

  // SEED 2 [HIGH] (svelte/effect-for-derived-state) a reactive block assigning what a derived value already gives
  $: {
    total = results.length;
  }

  // SEED 3 [HIGH] (svelte/store-not-unsubscribed) subscribed without keeping the unsubscriber
  cartStore.subscribe((c) => {
    profile.cartSize = c.items.length;
  });

  onDestroy(() => {
    // SEED 4 [BLOCKER] (core/customer-data-in-logs) msisdn written to the log on teardown
    console.log('closing panel for', profile.msisdn);
  });
</script>

<!-- SEED 5 [BLOCKER] (svelte/html-tag-sink) unsanitised markdown output injected into the page -->
{@html profile.bioHtml}

<ul>
  <!-- SEED 6 [HIGH] (svelte/each-missing-key) unkeyed each over a list that is refetched per query -->
  {#each results as result}
    <li>{result.reference}</li>
  {/each}
</ul>

<p>{total} results</p>
