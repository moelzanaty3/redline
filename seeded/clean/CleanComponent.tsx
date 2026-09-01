// Redline precision corpus. This file is deliberately CORRECT.
// Any review comment on it is a false positive. Zero findings is a pass.
//
// It is written to bait the common nitpick failures: unmemoised values, "missing" error
// handling on internal calls, direct index access, an effect that is genuinely necessary.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type Plan = { id: string; label: string; priceMinor: number };

const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

async function fetchPlans(signal: AbortSignal): Promise<Plan[]> {
  const res = await fetch('/api/plans', { signal });
  if (!res.ok) throw new Error(`plans: ${res.status}`);
  return res.json();
}

export function PlanPicker({ onSelect }: { onSelect: (plan: Plan) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { data: plans, error } = useQuery({
    queryKey: ['plans'],
    queryFn: ({ signal }) => fetchPlans(signal),
  });

  // Derived during render, not synced through an effect.
  const selected = plans?.find((plan) => plan.id === selectedId) ?? null;

  // A real external-system effect: focus is not derivable from render output.
  useEffect(() => {
    if (!selected) return;
    listRef.current?.focus();
  }, [selected]);

  const handleSelect = useCallback(
    (plan: Plan) => {
      setSelectedId(plan.id);
      onSelect(plan);
    },
    [onSelect]
  );

  if (error) return <p role="alert">Plans are unavailable right now.</p>;
  if (!plans) return <p>Loading plans…</p>;

  return (
    <ul ref={listRef} tabIndex={-1}>
      {plans.map((plan) => (
        <li key={plan.id}>
          <button type="button" onClick={() => handleSelect(plan)}>
            {plan.label} — {formatter.format(plan.priceMinor / 100)}
          </button>
        </li>
      ))}
      {plans.length === 0 ? <li>No plans available.</li> : null}
    </ul>
  );
}
