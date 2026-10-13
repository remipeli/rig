import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, NightDigest, ReadNight } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

// A real calendar date in YYYY-MM-DD. Checked before any file access.
export function isNight(night: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function isStatus(v: unknown): v is JobStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// Parse one non-blank line at the edge. Wrong JSON or wrong shape → null (a bad line).
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isStatus(o.status)) return null;
  const owner = o.owner;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  const error = o.error;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at: o.at, job: o.job, status: o.status, owner: owner ?? null, error: error ?? null };
}

// "Latest" = later in the file (the log is append-only).
export function digestLines(night: string, text: string): NightDigest {
  const byJob = new Map<string, DigestRow>();
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const run = parseLine(line);
    if (!run) {
      badLines++;
      continue;
    }
    counts[run.status]++;
    const row = byJob.get(run.job);
    if (!row) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        fails: run.status === 'fail' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.owner = run.owner;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    if (run.status === 'fail') row.fails++;
    row.lastStatus = run.status;
    if (run.error !== null) row.lastError = run.error;
    row.lastAt = run.at;
  }

  // Plain code-unit comparison: same order on every machine and locale.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw e;
  }
  return digestLines(night, text);
};
