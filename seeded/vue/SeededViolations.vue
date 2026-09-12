<!--
  DO NOT MERGE — Redline validation seed.
  Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
  citing that rule id. Score with scripts/score-seeds.mjs.
-->
<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';

// SEED 1 [BLOCKER] (core/hardcoded-secrets) service token committed in source
const SERVICE_TOKEN = 'sk_live_acme_billing_9f31c0ea';

// SEED 2 [BLOCKER] (vue/public-env-secret) server secret read through a client-inlined env var
const signingKey = import.meta.env.VITE_PAYMENT_SIGNING_KEY;

// SEED 3 [BLOCKER] (vue/ssr-module-scope-state) module-scope mutable state, shared by every SSR request
const cart = reactive({ items: [] as string[], owner: '' });

const props = defineProps<{ profile: { bio: string; msisdn: string; seen: boolean } }>();

// SEED 4 [BLOCKER] (vue/reactivity-lost-on-destructure) destructuring a reactive object freezes the value
const { items } = cart;

const route = useRoute();
const results = ref<string[]>([]);
const total = ref(0);

// SEED 5 [BLOCKER] (vue/prop-mutation) child writing to an object the parent owns
function markSeen() {
  props.profile.seen = true;
}

// SEED 6 [HIGH] (vue/watch-instead-of-computed) a watch whose only job is assigning derived state
watch(results, (next) => {
  total.value = next.length;
});

// SEED 7 [HIGH] (vue/watcher-missing-cleanup) request started per keystroke with no cleanup, so the stale response wins
watch(
  () => route.query.q,
  async (q) => {
    // SEED 8 [HIGH] (vue/unvalidated-route-param) query param used as a typed value with no validation
    const page = Number(route.query.page);
    const res = await fetch(`/api/search?q=${q}&page=${page}`, {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    results.value = await res.json();
  }
);

async function load() {
  await fetch('/api/session');
  // SEED 9 [HIGH] (vue/lifecycle-after-await) registered past an await, so it never runs
  onMounted(() => {
    cart.owner = props.profile.msisdn;
  });
}

// SEED 10 [BLOCKER] (core/customer-data-in-logs) msisdn written to the console
console.log('cart owner', props.profile.msisdn, signingKey);

load();

// SEED 14 [HIGH] (javascript/var-in-new-code) function-scoped var in new code inside a single-file component
var retries = 0

// SEED 15 [HIGH] (javascript/unsafe-numeric-coercion) parseInt with no radix on a value from the query string
const perPage = parseInt(route.query.perPage)
</script>

<template>
  <!-- SEED 11 [BLOCKER] (vue/v-html-sink) unsanitised user html injected into the page -->
  <div v-html="props.profile.bio" />

  <ul>
    <!-- SEED 12 [HIGH] (vue/v-for-index-key) index key on a list that reorders -->
    <li v-for="(item, index) in items" :key="index">{{ item }}</li>
  </ul>

  <ol>
    <!-- SEED 13 [HIGH] (vue/v-if-with-v-for) v-if and v-for on the same element -->
    <li v-for="result in results" :key="result" v-if="result">{{ result }}</li>
  </ol>

  <button @click="markSeen">seen</button>
</template>
