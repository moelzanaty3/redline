// DO NOT MERGE — Redline validation seed (anti-slop rules).
'use client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// SEED 1 [BLOCKER] (nextjs/async-client-component) async component in a 'use client' module
export default async function Orders() {
  const orders = await fetch('/api/orders').then((r) => r.json());
  return <ul>{orders.map((o: { id: string }) => <li key={o.id}>{o.id}</li>)}</ul>;
}

export async function Dashboard() {
  const store = await cookies();
  // SEED 2 [BLOCKER] (nextjs/cookie-write-in-render) cookie written while rendering
  store.set('last_seen', new Date().toISOString());
  return <p>Overview</p>;
}

export async function createOrder(form: FormData) {
  try {
    const id = await db.order.create(form);
    // SEED 3 [HIGH] (nextjs/navigation-throw-caught) the catch swallows the redirect
    redirect(`/orders/${id}`);
  } catch {
    return { error: 'Something went wrong' };
  }
}

export async function renameProject(id: string, name: string) {
  // SEED 4 [HIGH] (nextjs/mutation-without-revalidation) cached pages keep the old name
  await db.project.update({ where: { id }, data: { name } });
}
