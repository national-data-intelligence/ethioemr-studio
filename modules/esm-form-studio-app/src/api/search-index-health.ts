/**
 * Is this server's concept search complete? The REST search (`concept?q=`) reads the server's search index, not
 * the database. When concepts are loaded straight into the database (a CIEL dump, a SQL restore), the index
 * doesn't know them until an administrator rebuilds it, and search quietly misses them. Measured on the local
 * EthioEMR (2026-10-17): 72,591 active concepts listed, but 0 of 8 sampled concepts found by their own name;
 * "weight" found 35 concepts, 34 of them ours, and not CIEL "Weight (kg)".
 *
 * The check: take a few concepts spread across the server's own list and search each by its name. If search
 * can't find concepts that plainly exist, the index is out of date. Read-only, about a dozen small requests,
 * once per session.
 */
import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface SearchIndexHealth {
  sampled: number;
  found: number;
  /** true when fewer than 3 in 4 sampled concepts can be found by searching their own name */
  stale: boolean;
}

const SAMPLES = 6;

type Fetch = <T>(url: string) => Promise<{ data: T }>;

export async function checkSearchIndex(fetcher: Fetch = openmrsFetch): Promise<SearchIndexHealth> {
  const total =
    (await fetcher<{ totalCount?: number }>(`${restBaseUrl}/concept?limit=1&totalCount=true&v=custom:(uuid)`)).data
      .totalCount ?? 0;
  let sampled = 0;
  let found = 0;
  for (let i = 0; i < SAMPLES && total > 0; i++) {
    const offset = Math.floor((total * (i + 0.5)) / SAMPLES);
    const pick = (
      await fetcher<{ results: Array<{ uuid: string; display: string }> }>(
        `${restBaseUrl}/concept?limit=1&startIndex=${offset}&v=custom:(uuid,display)`,
      )
    ).data.results?.[0];
    const name = pick?.display?.replace(/^[\s-]+/, '').slice(0, 60);
    if (!pick || !name) continue;
    sampled++;
    const hits = (
      await fetcher<{ results: Array<{ uuid: string }> }>(
        `${restBaseUrl}/concept?q=${encodeURIComponent(name)}&limit=50&v=custom:(uuid)`,
      )
    ).data.results;
    if (hits?.some((h) => h.uuid === pick.uuid)) found++;
  }
  return { sampled, found, stale: sampled > 0 && found / sampled < 0.75 };
}

export function useSearchIndexHealth() {
  const { data } = useSWRImmutable<SearchIndexHealth>('form-studio/search-index-health', () => checkSearchIndex(), {
    shouldRetryOnError: false,
  });
  return data;
}
