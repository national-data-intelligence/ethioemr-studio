import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

interface Page<T> {
  results: Array<T>;
  links?: Array<{ rel: string; uri: string }>;
}

/**
 * REST lists stop at 100 results a page (EthioEMR has about 370 forms and 200 encounter types), so follow the "next"
 * links to the last page. The links are absolute URLs; only their path and query are used, so requests stay on
 * this origin.
 */
export async function fetchAllPages<T>(url: string): Promise<Array<T>> {
  const all: Array<T> = [];
  let next: string | null = url;
  while (next) {
    const response = await openmrsFetch<Page<T>>(next);
    all.push(...(response.data?.results ?? []));
    const nextLink = response.data?.links?.find((link) => link.rel === 'next')?.uri;
    next = nextLink ? nextLink.substring(nextLink.indexOf(restBaseUrl)) : null;
  }
  return all;
}
