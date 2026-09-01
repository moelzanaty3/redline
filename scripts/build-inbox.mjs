#!/usr/bin/env node
// Zero-infra engineering inbox: aggregates org PRs into one prioritised static page.
// Run by workflows/inbox.yml on a schedule, deployed to GitHub Pages.
//
// NOTE: this page lists PR titles, authors and repo names. Publish it to a PRIVATE or
// INTERNAL Pages site only. workflows/inbox.yml refuses to build unless the visibility
// has been acknowledged.
//
// Env: GH_TOKEN (org read), ORG, [OUT=dist], [MAX_PAGES=10]

import { mkdirSync, writeFileSync } from 'node:fs';

const { GH_TOKEN, ORG, OUT = 'dist', MAX_PAGES = '10' } = process.env;
if (!GH_TOKEN || !ORG) throw new Error('GH_TOKEN and ORG are required');

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000).toISOString();
    throw new Error(`rate limited until ${reset}`);
  }
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

// The search API caps at 1000 results (10 pages of 100). Paginate to that ceiling and
// report when a bucket is truncated rather than silently under-reporting.
async function search(q) {
  const items = [];
  let total = 0;
  for (let page = 1; page <= Number(MAX_PAGES); page++) {
    const result = await api(
      `/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}&sort=updated&order=desc`
    );
    total = result.total_count ?? 0;
    items.push(...(result.items ?? []));
    if (!result.items?.length || items.length >= total) break;
  }
  return { items, total, truncated: total > items.length };
}

const days = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);
const isoDay = (offsetDays) =>
  new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);

const base = `org:${ORG} is:pr is:open draft:false`;
const buckets = [
  { label: 'Gate failing', priority: 1, q: `${base} status:failure` },
  { label: 'Changes requested', priority: 2, q: `${base} review:changes_requested` },
  { label: 'Awaiting review', priority: 3, q: `${base} review:required` },
  { label: 'Stale (>7d idle)', priority: 4, q: `${base} updated:<${isoDay(7)}` },
];

const results = await Promise.all(buckets.map((b) => search(b.q)));

const seen = new Set();
const rows = [];
const truncated = [];
buckets.forEach((bucket, i) => {
  const { items, total, truncated: cut } = results[i];
  if (cut) truncated.push(`${bucket.label} (${items.length} of ${total})`);
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    rows.push({
      priority: bucket.priority,
      label: bucket.label,
      repo: item.repository_url.split('/').slice(-1)[0],
      number: item.number,
      title: item.title,
      author: item.user?.login ?? '?',
      age: days(item.created_at),
      idle: days(item.updated_at),
      url: item.html_url,
    });
  }
});
rows.sort((a, b) => a.priority - b.priority || b.idle - a.idle);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = { 1: '#b91c1c', 2: '#c2410c', 3: '#1d4ed8', 4: '#6b7280' };
const counts = buckets.map((b) => `${b.label}: ${rows.filter((r) => r.label === b.label).length}`).join(' · ');

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redline Inbox — ${esc(ORG)}</title>
<style>
  :root{color-scheme:dark}
  body{font:14px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#0f1115;color:#e5e7eb;padding:2rem}
  h1{font-size:1.3rem;margin:0 0 .25rem}h1 span{color:#ef4444}
  table{border-collapse:collapse;width:100%;max-width:1200px}
  td,th{padding:.5rem .75rem;border-bottom:1px solid #1f2430;text-align:left;vertical-align:top}
  th{color:#9ca3af;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
  a{color:#93c5fd;text-decoration:none}a:hover{text-decoration:underline}
  .b{border-radius:4px;padding:.1rem .5rem;font-size:.75rem;color:#fff;white-space:nowrap;display:inline-block}
  .meta{color:#6b7280;font-size:.8rem;margin:.25rem 0 1rem}
  .warn{background:#7f1d1d;color:#fee2e2;padding:.5rem .75rem;border-radius:6px;max-width:1200px;margin:0 0 1rem}
  input{background:#151922;border:1px solid #2a3140;color:#e5e7eb;border-radius:6px;padding:.4rem .6rem;width:22rem;margin-bottom:1rem}
  tr[hidden]{display:none}
</style>
<h1><span>Redline</span> Inbox — ${esc(ORG)}</h1>
<p class="meta">Generated ${new Date().toISOString()} · ${rows.length} PRs need attention · ${esc(counts)}</p>
${truncated.length ? `<p class="warn">Result cap reached — counts are a lower bound for: ${esc(truncated.join(', '))}</p>` : ''}
${rows.length === 0 ? '<p class="warn">No rows. Either the org has a clean board, or the token lost access — check the workflow run.</p>' : ''}
<input id="f" placeholder="Filter by repo, author, or title" autocomplete="off">
<table>
<thead><tr><th>State</th><th>PR</th><th>Repo</th><th>Author</th><th>Age</th><th>Idle</th></tr></thead>
<tbody id="rows">
${rows
  .map(
    (r) => `<tr data-k="${esc(`${r.repo} ${r.author} ${r.title}`.toLowerCase())}">
<td><span class="b" style="background:${badge[r.priority]}">${esc(r.label)}</span></td>
<td><a href="${esc(r.url)}">#${r.number} ${esc(r.title)}</a></td>
<td>${esc(r.repo)}</td><td>${esc(r.author)}</td><td>${r.age}d</td><td>${r.idle}d</td></tr>`
  )
  .join('\n')}
</tbody>
</table>
<script>
  const input = document.getElementById('f');
  const rows = [...document.querySelectorAll('#rows tr')];
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    for (const row of rows) row.hidden = q !== '' && !row.dataset.k.includes(q);
  });
</script>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
console.log(`inbox: ${rows.length} rows${truncated.length ? ` (truncated: ${truncated.join(', ')})` : ''}`);
