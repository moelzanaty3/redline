import type { Step } from "@/lib/lifecycle";

// An ordered list where each step is a command or an action and the prose under
// it says why skipping it breaks something. Rendered the same way on every
// reference page so the edit loop is recognisable at a glance.
export function LifecycleSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="lifecycle">
      {steps.map((step) => (
        <li key={step.label}>
          <b>{step.label}</b>
          <span>{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}
