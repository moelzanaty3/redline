// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded auth token
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.acme-prod-token';

// SEED 2 [BLOCKER] (core/escape-hatch-types) any-typed props
export function SeededViolations({ items }: { items: any }) {
  const { data } = useQuery({ queryKey: ['plans'], queryFn: fetchPlans });
  const [plans, setPlans] = useState([]);

  // SEED 3 [BLOCKER] (react/server-data-in-local-state) server data copied into local state
  useEffect(() => {
    setPlans(data as never[]);
  }, [data]);

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [fullName, setFullName] = useState('');

  // SEED 4 [BLOCKER] (react/effect-derived-state) derived state synced through an effect
  useEffect(() => {
    setFullName(first + ' ' + last);
  }, [first, last]);

  // SEED 5 [BLOCKER] (react/missing-effect-cleanup) interval registered with no cleanup and no dependency array
  useEffect(() => {
    setInterval(() => console.log('tick', fullName), 1000);
  });

  // SEED 6 [BLOCKER] (react/nested-component-definition) component defined inside a component — remounts every render
  function Row({ label }: { label: string }) {
    return <li>{label}</li>;
  }

  return (
    <ul onClick={() => setFirst(last)}>
      {/* SEED 7 [BLOCKER] (react/key-is-index) key={index} on a list that can reorder */}
      {plans.map((p: any, index: number) => (
        <Row key={index} label={p} />
      ))}
      {/* SEED 8 [HIGH] (react/falsy-and-rendering) falsy && render — 0 leaks into the tree */}
      {plans.length && <span>has plans</span>}
      {/* SEED 9 [BLOCKER] (core/html-injection-sink) unsanitised HTML injection sink */}
      <li dangerouslySetInnerHTML={{ __html: items?.description }} />
    </ul>
  );
}

async function fetchPlans() {
  return ['a', 'b'];
}
