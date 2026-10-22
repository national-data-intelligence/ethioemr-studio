/**
 * The dictionary page and the intake matcher find a concept by its exact name even when the server's text search
 * (?q=) misses it: on the local EthioEMR "heart rate" by text finds 2 concepts, not "Heart Rate".
 * The server is faked here: nothing is contacted.
 */
import { openmrsFetch } from '@openmrs/esm-framework';
import { describe, expect, it, vi } from 'vitest';
import { searchConcepts } from '../api/concept-index.resource';
import { mergeByUuid, serverConcepts } from '../intake/match-concepts';

const row = (uuid: string, display: string) => ({ uuid, display, retired: false, set: false, names: [{ display }] });
const HEART_RATE = row('hr-1', 'Heart Rate');
const OTHERS = [row('x-1', 'Fetal heart rate'), row('x-2', 'Heart rate variability')];

function fakeServer() {
  vi.mocked(openmrsFetch).mockImplementation(async (url: string) => {
    const exact = url.includes('?name=');
    const results = exact ? [HEART_RATE] : OTHERS; // the text search misses the exact name
    return { data: { results, totalCount: results.length } } as never;
  });
}

describe('exact names are found even when the text search misses them', () => {
  it('concept dictionary: the exact name comes first, nothing is listed twice', async () => {
    fakeServer();
    const { concepts, total } = await searchConcepts('heart rate', false);
    expect(concepts.map((c) => c.name)).toEqual(['Heart Rate', 'Fetal heart rate', 'Heart rate variability']);
    expect(total).toBe(3);
  });

  it('intake matcher: byName returns the exact name first', async () => {
    fakeServer();
    const found = await serverConcepts().byName('Heart Rate');
    expect(found.map((c) => c.display)).toEqual(['Heart Rate', 'Fetal heart rate', 'Heart rate variability']);
  });

  it('merging keeps the first copy of a concept found by both searches', () => {
    expect(mergeByUuid([HEART_RATE], [HEART_RATE, ...OTHERS]).map((c) => c.uuid)).toEqual(['hr-1', 'x-1', 'x-2']);
  });
});
