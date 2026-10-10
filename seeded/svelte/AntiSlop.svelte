<!-- DO NOT MERGE — Redline validation seed (anti-slop rules). -->
<script>
  import { readable } from 'svelte/store';
  import { isLoggedIn } from '$lib/stores';
  let { user, items } = $props();

  // SEED 1 [BLOCKER] (svelte/async-store-start) the Promise is called as the stop function
  export const me = readable(null, async (set) => { set(await (await fetch('/api/me')).json()); });

  // SEED 2 [BLOCKER] (svelte/browser-global-at-top-level) localStorage on the server is a 500
  const theme = localStorage.getItem('theme') ?? 'light';

  // SEED 3 [HIGH] (svelte/non-reactive-builtin-in-state) Set mutations never update the view
  let selected = $state(new Set());
  const toggle = (id) => (selected.has(id) ? selected.delete(id) : selected.add(id));

  let panel;
</script>

<!-- SEED 4 [HIGH] (svelte/store-or-signal-as-value) the store object is always truthy -->
{#if isLoggedIn}<p>Admin</p>{/if}

<!-- SEED 5 [HIGH] (svelte/double-brace-mustache) renders [object Object] -->
<h1>Welcome back, {{ user.name }}</h1>

{#each items as item (item.id)}
  <!-- SEED 6 [HIGH] (svelte/handler-not-function) deletes every item on render -->
  <button onclick={remove(item.id)}>Delete</button>
{/each}

<div bind:this={panel}>Details</div>
<!-- SEED 7 [HIGH] (svelte/bound-node-dom-mutation) removes a node Svelte still owns -->
<button onclick={() => panel.remove()}>Close</button>
<p>{selected.size} selected, theme {theme}</p>
