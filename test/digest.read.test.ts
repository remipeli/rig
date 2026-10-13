import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const d = readNight('runs', '2026-10-28');
  const row = (job: string) => d?.rows.find((r) => r.job === job);

  it('reads 5 jobs, sorted by job, and 1 bad line', () => {
    expect(d).not.toBeNull();
    expect(d?.night).toBe('2026-10-28');
    expect(d?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(d?.badLines).toBe(1);
    expect(d?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('counts retries and fails per job', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, fails: 0, lastStatus: 'ok', lastError: 'lock held' });
    expect(row('notes/backup')).toMatchObject({ runs: 1, fails: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps the offset in firstAt and lastAt', () => {
    expect(row('lane/sync')).toMatchObject({ firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' });
  });
});

describe('readNight edge cases (temp dir)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('empty file → rows [], not null', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '\n\n');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('missing file → null', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('invalid night → null, before touching the file system', () => {
    writeFileSync(join(dir, 'x.jsonl'), '{"at":"a","job":"j","status":"ok"}\n');
    for (const night of ['../x', 'x', '2026-02-30', '2026-1-01', '2026-01-01/../x']) {
      expect(readNight(dir, night)).toBeNull();
    }
  });

  it('counts wrong-shape lines as bad; a missing owner is null, not bad', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"done","owner":"x"}',
      '{"at":1,"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","error":null}',
      '[1,2]',
      'not json',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const d = readNight(dir, '2026-01-03');
    expect(d?.badLines).toBe(6);
    expect(d?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        fails: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-03T01:00:00+02:00',
        lastAt: '2026-01-03T01:00:00+02:00',
      },
    ]);
  });
});
