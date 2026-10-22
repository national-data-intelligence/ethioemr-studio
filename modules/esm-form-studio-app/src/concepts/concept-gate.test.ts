/**
 * Concept search against the local server (FS_SERVER, FS_SERVER_AUTH; GET only): searching "Na"
 * for a question doesn't offer the Drug-form "NA"; "heart rate" ranks the right concept above Fetal heart rate.
 */
import { describe, expect, it } from 'vitest';
import { rankConcepts, type SearchConcept } from './concept-rules';

const SERVER = process.env.FS_SERVER;
const AUTH = process.env.FS_SERVER_AUTH;

async function search(query: string): Promise<Array<SearchConcept>> {
  const headers = { Authorization: `Basic ${Buffer.from(AUTH ?? '').toString('base64')}` };
  const get = (p: string) =>
    fetch(`${SERVER}/ws/rest/v1/concept?${p}=${encodeURIComponent(query)}&v=full`, { headers }).then((r) => r.json());
  const [byName, byText] = await Promise.all([get('name'), get('q')]);
  return [...(byName.results ?? []), ...(byText.results ?? [])];
}

describe.skipIf(!SERVER || !AUTH)('concept search gate (local server)', () => {
  it('never offers the Drug-form "NA" as a question for "Na"', async () => {
    const ranked = rankConcepts(await search('Na'), 'Na', 'question', { rendering: 'number' });
    const na = ranked.filter((r) => r.concept.conceptClass?.display === 'Drug form');
    console.warn(
      'Na top 5:',
      ranked
        .slice(0, 5)
        .map((r) => `${r.concept.display} [${r.verdict}]`)
        .join(' | '),
    );
    expect(na.length).toBeGreaterThan(0); // the exact-name lookup finds it
    expect(na.every((r) => r.verdict === 'blocked')).toBe(true);
    expect(ranked.at(-1).verdict).toBe('blocked');
    expect(ranked[0]?.verdict).not.toBe('blocked');
  });

  it('ranks the heart rate concept above Fetal heart rate', async () => {
    const ranked = rankConcepts(await search('heart rate'), 'heart rate', 'question', { rendering: 'number' });
    console.warn(
      'heart rate top 5:',
      ranked
        .slice(0, 5)
        .map((r) => `${r.concept.display} (${r.concept.datatype?.display}) [${r.verdict}]`)
        .join(' | '),
    );
    expect(ranked[0].concept.display.toLowerCase()).toBe('heart rate');
    const fetal = ranked.findIndex((r) => /fetal heart rate/i.test(r.concept.display));
    expect(fetal === -1 || fetal > 0).toBe(true);
  });
});
