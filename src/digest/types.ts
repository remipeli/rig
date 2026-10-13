// Contract for the morning digest (plan.md § 1). Section 2 (page, JSON, board link, route
// tests) builds against these types only; src/digest/read.ts implements ReadNight.

export type JobStatus = 'ok' | 'retry' | 'fail';

/** One row per job seen in the night's run log. Built from valid lines only. */
export type DigestRow = {
  job: string;
  /**
   * Owner of the job's latest valid line. `null` stays `null` (views render `—`).
   * A line with no `owner` key counts as owner `null`, not as a bad line.
   */
  owner: string | null;
  /** Number of valid lines for this job. */
  runs: number;
  /** Number of `retry` lines. The page marks 3 or more. */
  retries: number;
  /** Number of `fail` lines. The page marks any fail (> 0). */
  fails: number;
  /** Status of the job's latest valid line. */
  lastStatus: JobStatus;
  /**
   * The latest `error` seen for this job in the night, `null` if none.
   * Kept even when `lastStatus` is `ok` (e.g. retries that recovered).
   */
  lastError: string | null;
  /** `at` of the job's first valid line, exactly as in the log (offset kept, never UTC). */
  firstAt: string;
  /** `at` of the job's latest valid line, exactly as in the log (offset kept, never UTC). */
  lastAt: string;
};

export type NightDigest = {
  /** The night, `YYYY-MM-DD`. */
  night: string;
  /** Already sorted by `job`. Page and JSON both use this order as is; never re-sort. */
  rows: DigestRow[];
  /**
   * Lines that do not parse as JSON or do not have the right shape. Counted, never thrown.
   * Blank lines are not counted.
   */
  badLines: number;
  /** Valid lines by status, for the status board. */
  counts: Record<JobStatus, number>;
};

/**
 * Reads `<runsDir>/<night>.jsonl`.
 * Returns `null` when there is no file for that night, or when `night` is not a valid
 * `YYYY-MM-DD` (routes answer 404; no path tricks reach the file system).
 * An empty file is not `null`: it is a NightDigest with `rows: []` ("nothing ran").
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
