<!-- DO NOT MERGE — Redline validation seed (anti-slop rules). -->
<template>
  <button v-if="canDelete" @click="$emit('click', item)">{{ label }}</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
const props = defineProps<{ item: { id: string }; items: { date: number }[] }>();

const isAdmin = ref(false);
// SEED 1 [HIGH] (vue/ref-used-as-value) the ref object is always truthy
const canDelete = computed(() => (isAdmin ? true : false));

// SEED 2 [HIGH] (vue/async-computed) the computed holds a Promise
const profile = computed(async () => (await fetch(`/api/users/${props.item.id}`)).json());

// SEED 3 [HIGH] (vue/side-effect-in-computed) sorts the source array in place
const sorted = computed(() => props.items.sort((a, b) => a.date - b.date));

// SEED 4 [HIGH] (vue/untyped-empty-ref) Ref<any> without anyone writing any
const user = ref();
const label = computed(() => user.value.fullName);
</script>

<script lang="ts">
export default {
  props: {
    // SEED 5 [HIGH] (vue/shared-mutable-default) one array shared by every instance
    tags: { type: Array,
      default: [],
    },
  },
  // SEED 6 [HIGH] (vue/vue2-api-in-vue3) never runs in Vue 3, so the interval leaks
  beforeDestroy() { clearInterval(this.timer); },
};
</script>
