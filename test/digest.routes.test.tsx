import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

// Fixtures live in a temp dir. runs/ is read-only and never touched here.
let runsDir = '';

const normalNight = [
  { at: '2026-10-28T23:00:01+01:00', job: 'zeta/report', status: 'ok', owner: 'rook' },
  { at: '2026-10-28T23:10:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-10-28T23:11:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-10-28T23:12:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-10-28T23:13:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' },
  { at: '2026-10-28T23:00:02+01:00', job: 'rig/rotate-logs', status: 'fail', owner: 'lane-07', error: 'disk full' },
  { at: '2026-10-28T23:00:03+01:00', job: 'rig/fetch', status: 'ok', owner: null },
].map((line) => JSON.stringify(line)).join('\n') + '\n';

const normalJobs = ['lane/sync', 'rig/fetch', 'rig/rotate-logs', 'zeta/report'];

const badLineNight = [
  JSON.stringify({ at: '2026-10-27T23:00:01+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  '{"at":"2026-10-27T23:00:02+01:00","job":"rig/rotate-logs","status":"o',
  JSON.stringify({ at: '2026-10-27T23:00:03+01:00', job: 'rig/fetch', status: 'ok', owner: 'lane-07' }),
].join('\n') + '\n';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

beforeAll(() => {
  process.env.LANE_MARKER = 'DIGEST-TEST-MARKER';
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  fs.writeFileSync(path.join(runsDir, '2026-10-28.jsonl'), normalNight);
  fs.writeFileSync(path.join(runsDir, '2026-10-26.jsonl'), '');
  fs.writeFileSync(path.join(runsDir, '2026-10-27.jsonl'), badLineNight);
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

const app = () => createApp({ ...config, runsDir });

describe('digest page: GET /digest/:night', () => {
  it('renders the normal night with the lane banner', async () => {
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('DIGEST-TEST-MARKER');
    for (const job of normalJobs) expect(html).toContain(job);
  });

  it('marks a 3+ retry row and a fail row with warn', async () => {
    const html = await (await app().request('/digest/2026-10-28')).text();
    const rowOf = (job: string) => {
      const start = html.lastIndexOf('<tr', html.indexOf(`>${job}<`));
      return html.slice(start, html.indexOf('</tr>', start));
    };
    const syncRow = rowOf('lane/sync');
    const failRow = rowOf('rig/rotate-logs');
    expect(syncRow).toContain('warn');
    expect(syncRow).toContain('3+ retries');
    expect(failRow).toContain('warn');
    expect(failRow).toContain('fail');
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await app().request('/digest/2026-10-28')).text();
    const fetchRow = html.slice(html.indexOf('rig/fetch'), html.indexOf('</tr>', html.indexOf('rig/fetch')));
    expect(fetchRow).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app().request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('stays 200 and notes the bad line', async () => {
    const res = await app().request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/could not be read|bad line|unreadable/i);
    expect(html).toContain('lane/sync');
    expect(html).toContain('rig/fetch');
  });
});

describe('digest JSON: GET /api/digest/:night', () => {
  it('returns the normal night as NightDigest', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(normalJobs);
    expect(body.badLines).toBe(0);
    const sync = body.rows.find((r) => r.job === 'lane/sync');
    expect(sync?.retries).toBe(3);
    const rotate = body.rows.find((r) => r.job === 'rig/rotate-logs');
    expect(rotate?.fails).toBe(1);
    const fetch = body.rows.find((r) => r.job === 'rig/fetch');
    expect(fetch?.owner).toBeNull();
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-01-01' });
  });

  it('returns rows: [] for the empty night', async () => {
    const res = await app().request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and stays 200', async () => {
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/fetch']);
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order', async () => {
    const html = await (await app().request('/digest/2026-10-28')).text();
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as NightDigest;
    const jobs = body.rows.map((r) => r.job);
    const inPageOrder = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(inPageOrder).toEqual(jobs);
    expect(jobs.every((job) => html.includes(job))).toBe(true);
  });
});
