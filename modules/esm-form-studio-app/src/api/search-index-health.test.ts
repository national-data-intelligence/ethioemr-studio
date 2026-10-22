/** The search-index check: stale when concepts the server lists can't be found by their own name. No network. */
import { describe, expect, it } from 'vitest';
import { checkSearchIndex } from './search-index-health';

const fakeServer =
  (searchFinds: (name: string) => boolean) =>
  async <T>(url: string) => {
    const u = new URL(url, 'http://x');
    if (u.searchParams.get('totalCount')) return { data: { totalCount: 600, results: [] } as T };
    if (u.searchParams.has('startIndex')) {
      const i = u.searchParams.get('startIndex');
      return { data: { results: [{ uuid: `c-${i}`, display: `Concept ${i}` }] } as T };
    }
    const q = u.searchParams.get('q');
    const i = q.replace('Concept ', '');
    return { data: { results: searchFinds(q) ? [{ uuid: `c-${i}` }] : [{ uuid: 'other' }] } as T };
  };

describe('search index check', () => {
  it('is stale when search misses concepts the server lists (the local EthioEMR: 0 of 8)', async () => {
    expect(await checkSearchIndex(fakeServer(() => false))).toEqual({ sampled: 6, found: 0, stale: true });
  });
  it('is fine when search finds them', async () => {
    expect(await checkSearchIndex(fakeServer(() => true))).toEqual({ sampled: 6, found: 6, stale: false });
  });
  it('allows a miss or so (a name shared by several concepts)', async () => {
    let n = 0;
    expect((await checkSearchIndex(fakeServer(() => ++n !== 2))).stale).toBe(false);
  });
});
