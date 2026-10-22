import { expect, it, vi } from 'vitest';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { fetchAllForms } from './forms.resource';

const form = (n: number) => ({
  uuid: `uuid-${n}`,
  name: `Form ${n}`,
  version: '1.0',
  published: true,
  retired: false,
  resources: [],
});

it('reads every page of forms, not just the first 100', async () => {
  const page = (ids: Array<number>, next?: string) => ({
    data: { results: ids.map(form), links: next ? [{ rel: 'next', uri: `http://emr.example${next}` }] : [] },
  });
  vi.mocked(openmrsFetch)
    .mockResolvedValueOnce(page([1, 2], `${restBaseUrl}/form?startIndex=2`) as never)
    .mockResolvedValueOnce(page([3]) as never);

  const forms = await fetchAllForms(`${restBaseUrl}/form`);

  expect(forms.map((f) => f.uuid)).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
  expect(vi.mocked(openmrsFetch)).toHaveBeenLastCalledWith(`${restBaseUrl}/form?startIndex=2`);
});
