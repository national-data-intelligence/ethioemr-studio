import { type ConceptIndexEntry } from '../api/concept-index.resource';
import { type FormUsage } from '../api/form-usage.resource';

export interface DictionaryFilter {
  /** matches any name in any locale, or the uuid */
  query: string;
  className: string;
  datatype: string;
  includeRetired: boolean;
  usedInFormsOnly: boolean;
}

export type SortKey = 'name' | 'synonyms' | 'className' | 'datatype' | 'usedIn' | 'status';
export type SortDirection = 'ASC' | 'DESC';

export const ALL = '';

/** The concept's other names (synonyms, short names, other languages), each once, without its own display name. */
export function synonymsOf(concept: ConceptIndexEntry): Array<string> {
  const seen = new Set([concept.name.trim().toLowerCase()]);
  return concept.names.filter((n) => {
    const key = n.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Search results with the best match first: a name equal to the search, then one that starts with it, then the
 * rest; within each, the order they came in (A-Z). */
export function byRelevance(concepts: Array<ConceptIndexEntry>, query: string): Array<ConceptIndexEntry> {
  const q = query.trim().toLowerCase();
  const rank = (c: ConceptIndexEntry) => {
    const names = [c.name, ...c.names].map((n) => n.toLowerCase());
    return names.some((n) => n === q) ? 0 : names.some((n) => n.startsWith(q)) ? 1 : 2;
  };
  return concepts
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ c }) => c);
}

export const usedInCount = (concept: ConceptIndexEntry, usage?: FormUsage) =>
  usage?.get(concept.uuid.toLowerCase())?.length ?? 0;

export function filterConcepts(
  concepts: Array<ConceptIndexEntry>,
  filter: DictionaryFilter,
  usage?: FormUsage,
): Array<ConceptIndexEntry> {
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return concepts.filter((concept) => {
    if (!filter.includeRetired && concept.retired) {
      return false;
    }
    if (filter.className && concept.className !== filter.className) {
      return false;
    }
    if (filter.datatype && concept.datatype !== filter.datatype) {
      return false;
    }
    if (filter.usedInFormsOnly && usedInCount(concept, usage) === 0) {
      return false;
    }
    if (terms.length) {
      const haystack = (concept.uuid + ' ' + concept.name + ' ' + concept.names.join(' ')).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }
    return true;
  });
}

export function sortConcepts(
  concepts: Array<ConceptIndexEntry>,
  key: SortKey,
  direction: SortDirection,
  usage?: FormUsage,
): Array<ConceptIndexEntry> {
  const value = (c: ConceptIndexEntry): string | number => {
    switch (key) {
      case 'usedIn':
        return usedInCount(c, usage);
      case 'synonyms':
        return synonymsOf(c).join(', ').toLowerCase();
      case 'status':
        return c.retired ? 1 : 0;
      default:
        return (c[key] ?? '').toString().toLowerCase();
    }
  };
  const sign = direction === 'ASC' ? 1 : -1;
  return [...concepts].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const order = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return order !== 0 ? sign * order : a.name.localeCompare(b.name);
  });
}

/** The distinct, sorted values of one field, for the filter dropdowns. */
export const distinct = (concepts: Array<ConceptIndexEntry>, field: 'className' | 'datatype') =>
  Array.from(new Set(concepts.map((c) => c[field]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
