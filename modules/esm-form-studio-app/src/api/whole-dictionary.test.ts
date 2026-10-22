/** Reading the whole dictionary from the database, page by page (a fake server; no network). */
import { describe, expect, it } from 'vitest';
import { PAGE, readWholeDictionary } from './whole-dictionary';
import { searchWholeDictionary } from '../concepts/use-concept-search';

const TOTAL = 250;
const concept = (i: number) => ({
  uuid: `c-${i}`,
  display: i === 7 ? 'Weight (kg)' : i === 8 ? 'Weight loss' : `Concept ${String(i).padStart(3, '0')}`,
  retired: i === 9,
  set: false,
  datatype: { display: 'Numeric' },
  conceptClass: { display: 'Question' },
  names: i === 7 ? [{ display: 'Weight (kg)' }, { display: 'WT' }, { display: 'WT' }] : [],
});

function fakeServer({ failOnce }: { failOnce?: number } = {}) {
  const asked: Array<string> = [];
  let failed = false;
  const fetcher = async <T>(url: string) => {
    asked.push(url);
    const u = new URL(url, 'http://x');
    if (u.searchParams.get('totalCount')) return { data: { totalCount: TOTAL, results: [] } as T };
    const start = Number(u.searchParams.get('startIndex'));
    if (failOnce === start && !failed) {
      failed = true;
      throw new Error('busy');
    }
    const limit = Number(u.searchParams.get('limit'));
    const rows = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - start)) }, (_, k) => concept(start + k));
    return { data: { results: rows } as T };
  };
  return { fetcher, asked };
}

describe('whole dictionary', () => {
  it('reads every concept, retired included, 100 at a time, and reports progress', async () => {
    const { fetcher, asked } = fakeServer();
    const progress: Array<[number, number]> = [];
    const entries = await readWholeDictionary(fetcher, (read, total) => progress.push([read, total]));
    expect(entries).toHaveLength(TOTAL);
    expect(asked.filter((u) => u.includes('startIndex'))).toHaveLength(Math.ceil(TOTAL / PAGE));
    expect(asked.every((u) => u.includes('includeAll=true'))).toBe(true); // retired concepts too
    expect(progress.at(-1)).toEqual([TOTAL, TOTAL]);
    expect(entries.find((e) => e.uuid === 'c-7')).toMatchObject({ name: 'Weight (kg)', names: ['Weight (kg)', 'WT'] });
    expect(entries.find((e) => e.uuid === 'c-9').retired).toBe(true);
  });

  it('continues a first read that a reload interrupted, without reading those pages again', async () => {
    const first = fakeServer();
    let saved;
    await readWholeDictionary(first.fetcher, undefined, undefined, {
      every: 1,
      onCheckpoint: (partial) => {
        if (partial.done.length === 2) saved = partial; // the page was reloaded after two pages
      },
    });
    const second = fakeServer();
    const entries = await readWholeDictionary(second.fetcher, undefined, undefined, { resume: saved });
    expect(entries).toHaveLength(TOTAL);
    expect(second.asked.filter((u) => u.includes('startIndex'))).toHaveLength(Math.ceil(TOTAL / PAGE) - 2);
  });

  it('tries a failed page again instead of losing it', async () => {
    const { fetcher } = fakeServer({ failOnce: 100 });
    expect(await readWholeDictionary(fetcher)).toHaveLength(TOTAL);
  });

  it('finds concepts by any of their names, exact names first', async () => {
    const entries = await readWholeDictionary(fakeServer().fetcher);
    expect(searchWholeDictionary(entries, 'weight').map((c) => c.display)).toEqual(['Weight (kg)', 'Weight loss']); // both start with the word; a tie keeps A-Z order
    expect(searchWholeDictionary(entries, 'weight (kg)')[0].display).toBe('Weight (kg)');
    expect(searchWholeDictionary(entries, 'wt')[0]).toMatchObject({ uuid: 'c-7', datatype: { display: 'Numeric' } });
    expect(searchWholeDictionary(entries, '')).toEqual([]);
  });
});
