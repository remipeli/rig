import type { DigestRow, NightDigest } from '../digest/types.js';

const dash = (v: string | null) => (v === null || v === '' ? '—' : v);

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.fails > 0) out.push('fail');
  if (row.retries >= 3) out.push('3+ retries');
  return out;
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const m = marks(row);
              return (
                <tr class={m.length > 0 ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{dash(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.fails}</td>
                  <td>{row.lastStatus}</td>
                  <td>{dash(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{m.length > 0 ? m.join(' · ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 ? (
        <p class="mute">
          {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} in the log could not be read
        </p>
      ) : null}
    </>
  );
}
