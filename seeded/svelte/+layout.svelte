<!-- DO NOT MERGE — Redline validation seed (anti-slop rules). -->
<script context="module">
  // SEED 1 [HIGH] (svelte/load-in-page-component) SvelteKit never calls load from a .svelte file
  export async function load({ fetch }) { return { orders: await (await fetch('/api/orders')).json() }; }
</script>
