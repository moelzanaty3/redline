// DO NOT MERGE — Redline validation seed (anti-slop rules).
import { createContext, useEffect, useRef, useState } from 'react';

const AuthContext = createContext<unknown>(null);

export function Toggle() {
  const [open, setOpen] = useState(false);
  // SEED 1 [BLOCKER] (react/set-state-in-render) setter called during render
  return <button onClick={setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>;
}

export function Menu() {
  // SEED 2 [BLOCKER] (react/javascript-url) javascript: URL throws in React 19
  return <a href="javascript:void(0)">Menu</a>;
}

export function Search({ query }: { query: string }) {
  const [results, setResults] = useState<string[]>([]);
  // SEED 3 [HIGH] (react/async-effect-callback) no cleanup, stale responses win
  useEffect(async () => {
    setResults(await (await fetch(`/api/search?q=${query}`)).json());
  }, [query]);
  return <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>;
}

export function Todos({ todos }: { todos: { id: string; title: string }[] }) {
  // SEED 4 [HIGH] (react/impure-render) random key remounts every row
  return <ul>{todos.map((t) => <li key={Math.random()}>{t.title}</li>)}</ul>;
}

export function Latest({ value }: { value: string }) {
  const prev = useRef(value);
  // SEED 5 [HIGH] (react/ref-access-in-render) ref written and read during render
  prev.current = value;
  return <span>{prev.current}</span>;
}

export function Parent() {
  try {
    return <Chart />;
  // SEED 6 [HIGH] (react/try-catch-around-jsx) the child's render errors never reach this catch
  } catch {
    return <p>Chart unavailable</p>;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(null);
  // SEED 7 [HIGH] (react/unstable-context-value) new value identity on every render
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

// SEED 8 [HIGH] (react/object-default-prop) new [] each render re-runs the effect forever
export function List({ items = [] }: { items?: string[] }) {
  const [sorted, setSorted] = useState<string[]>([]);
  useEffect(() => setSorted([...items].sort()), [items]);
  return <ul>{sorted.map((i) => <li key={i}>{i}</li>)}</ul>;
}
