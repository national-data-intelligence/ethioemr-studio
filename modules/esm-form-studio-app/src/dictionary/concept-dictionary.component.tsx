/**
 * Concept dictionary: every concept in this EMR's database, searched, filtered, sorted and paged in a table.
 * The whole dictionary is read from the database once (api/whole-dictionary.ts: about 25 minutes the first time,
 * then kept in the browser) because the server's search index can miss most concepts (api/search-index-health.ts).
 * Until that copy is ready, the server's search answers, with a warning when its index is out of date. Opening a
 * row loads the concept's full details. Same table style as the team's apps (Carbon DataTable in a TableContainer).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Pagination,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandedRow,
  TableExpandHeader,
  TableExpandRow,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Toggle,
} from '@carbon/react';
import { useLayoutType } from '@openmrs/esm-framework';
import { MAX_RESULTS, MIN_QUERY, useConceptSearch } from '../api/concept-index.resource';
import { ensureWholeDictionary, refreshWholeDictionary, useWholeDictionary } from '../api/whole-dictionary';
import { useFormUsage } from '../api/form-usage.resource';
import SearchIndexWarning from '../concepts/search-index-warning.component';
import ConceptDetails from './concept-details.component';
import {
  ALL,
  distinct,
  filterConcepts,
  sortConcepts,
  byRelevance,
  synonymsOf,
  usedInCount,
  type DictionaryFilter,
  type SortDirection,
  type SortKey,
} from './dictionary-filter';
import styles from './concept-dictionary.scss';
import { plainText } from '../plain-text';

const PAGE_SIZES = [25, 50, 100, 200];

const ConceptDictionary: React.FC = () => {
  const { t } = useTranslation();
  const layout = useLayoutType();
  const size = layout === 'tablet' ? 'md' : 'sm';
  const { usage, isLoading: usageLoading } = useFormUsage();

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query), 400); // search once typing pauses
    return () => clearTimeout(timer);
  }, [query]);
  const [className, setClassName] = useState(ALL);
  const [datatype, setDatatype] = useState(ALL);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [usedInFormsOnly, setUsedInFormsOnly] = useState(false);
  const whole = useWholeDictionary();
  useEffect(() => {
    ensureWholeDictionary();
  }, []);
  // the whole dictionary once it is read; the server's search until then
  const fromDatabase = whole.status === 'ready' && Boolean(whole.entries);
  const { result, error, isLoading } = useConceptSearch(fromDatabase ? '' : searchTerm, includeRetired);
  const concepts = useMemo(
    () => (fromDatabase ? whole.entries : (result?.concepts ?? [])),
    [fromDatabase, whole.entries, result],
  );
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'ASC' });
  // while searching, the best match comes first, until a column header is clicked
  const [sortChosen, setSortChosen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const classes = useMemo(() => distinct(concepts, 'className'), [concepts]);
  const datatypes = useMemo(() => distinct(concepts, 'datatype'), [concepts]);

  // from the database: the text and the retired choice are matched here; from the server's search, it matched them
  const filter: DictionaryFilter = fromDatabase
    ? { query: searchTerm, className, datatype, includeRetired, usedInFormsOnly }
    : { query: '', className, datatype, includeRetired: true, usedInFormsOnly };
  const filtered = useMemo(
    () => {
      const matches = sortConcepts(filterConcepts(concepts, filter, usage), sort.key, sort.direction, usage);
      return fromDatabase && searchTerm.trim() && !sortChosen ? byRelevance(matches, searchTerm) : matches;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [concepts, usage, className, datatype, usedInFormsOnly, sort, sortChosen, fromDatabase, searchTerm, includeRetired],
  );
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, lastPage);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const headers: Array<{ key: SortKey; header: string }> = [
    { key: 'name', header: t('name', 'Name') },
    { key: 'synonyms', header: t('synonyms', 'Synonyms and other names') },
    { key: 'className', header: t('class', 'Class') },
    { key: 'datatype', header: t('datatype', 'Datatype') },
    { key: 'usedIn', header: t('usedInForms', 'Used in forms') },
    { key: 'status', header: t('status', 'Status') },
  ];

  const rows = pageRows.map((c) => ({
    id: c.uuid,
    name: c.name,
    synonyms: synonymsOf(c).join(', '),
    className: c.className,
    datatype: c.datatype,
    usedIn: c.uuid,
    status: c.retired,
  }));

  const toggleSort = (key: SortKey) => {
    setSortChosen(true);
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'ASC' ? 'DESC' : 'ASC' }));
  };

  const all = (label: string) => ({ id: ALL, text: label });

  if (error && !fromDatabase) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        title={t('couldNotLoadConcepts', 'Could not load concepts')}
        subtitle={error.message}
      />
    );
  }

  return (
    <div className={styles.dictionary}>
      {!fromDatabase && <SearchIndexWarning />}
      {(whole.status === 'reading' || whole.refreshing) && (
        <ProgressBar
          className={styles.reading}
          label={t('readingDictionary', 'Reading the whole dictionary from this EMR')}
          helperText={t(
            'readingDictionaryHelp',
            '{{read}} of {{total}} concepts. The first time takes about 25 minutes; you can keep working, and next time it opens at once.',
            { read: whole.read.toLocaleString(), total: whole.total ? whole.total.toLocaleString() : '…' },
          )}
          value={whole.read}
          max={whole.total || 1}
        />
      )}
      {whole.status === 'error' && (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t('couldNotReadDictionary', 'Could not read the whole dictionary')}
          subtitle={t('couldNotReadDictionaryHelp', 'Search uses the server for now. {{reason}}', {
            reason: whole.error,
            ...plainText,
          })}
        />
      )}
      <DataTable rows={rows} headers={headers} size={size}>
        {({ rows: tableRows, getTableProps, getRowProps, getExpandHeaderProps }) => (
          <TableContainer
            title={t('conceptDictionary', 'Concept dictionary')}
            description={
              fromDatabase
                ? t(
                    'conceptsFromDatabase',
                    "{{shown}} of {{total}} concepts, read from this EMR's database on {{date}}.",
                    {
                      shown: filtered.length.toLocaleString(),
                      total: concepts.length.toLocaleString(),
                      date: whole.readAt ? new Date(whole.readAt).toLocaleString() : '',
                      interpolation: { escapeValue: false }, // a date's "/" is text, not HTML
                    },
                  )
                : searchTerm.trim().length < MIN_QUERY
                  ? t(
                      'typeToSearch',
                      'Type at least {{min}} characters, or paste a uuid, to search every concept on this server.',
                      { min: MIN_QUERY },
                    )
                  : result && result.total > concepts.length
                    ? t(
                        'conceptsCapped',
                        '{{shown}} shown of {{total}} matches; the first {{max}} were loaded, narrow the search to see the rest.',
                        {
                          shown: filtered.length.toLocaleString(),
                          total: result.total.toLocaleString(),
                          max: MAX_RESULTS.toLocaleString(),
                        },
                      )
                    : t('conceptsShown', '{{shown}} shown of {{total}} matches', {
                        shown: filtered.length.toLocaleString(),
                        total: concepts.length.toLocaleString(),
                      })
            }
          >
            <TableToolbar>
              <TableToolbarContent className={styles.toolbar}>
                <TableToolbarSearch
                  persistent
                  placeholder={t('searchConcepts', 'Search by name, synonym or uuid')}
                  defaultValue={query}
                  onChange={(e) => resetPage(setQuery)(typeof e === 'string' ? e : e.target.value)}
                />
                <Dropdown
                  id="dictionary-class"
                  titleText=""
                  label={t('allClasses', 'All classes')}
                  type="inline"
                  items={[all(t('allClasses', 'All classes')), ...classes.map((c) => ({ id: c, text: c }))]}
                  itemToString={(item) => item?.text ?? ''}
                  onChange={({ selectedItem }) => resetPage(setClassName)(selectedItem?.id ?? ALL)}
                />
                <Dropdown
                  id="dictionary-datatype"
                  titleText=""
                  label={t('allDatatypes', 'All datatypes')}
                  type="inline"
                  items={[all(t('allDatatypes', 'All datatypes')), ...datatypes.map((d) => ({ id: d, text: d }))]}
                  itemToString={(item) => item?.text ?? ''}
                  onChange={({ selectedItem }) => resetPage(setDatatype)(selectedItem?.id ?? ALL)}
                />
                {fromDatabase && (
                  <Button kind="ghost" size="sm" disabled={whole.refreshing} onClick={() => refreshWholeDictionary()}>
                    {whole.refreshing ? t('refreshingDictionary', 'Refreshing…') : t('refreshDictionary', 'Refresh')}
                  </Button>
                )}
                <Toggle
                  id="dictionary-retired"
                  size="sm"
                  labelText={t('includeRetired', 'Include retired')}
                  labelA=""
                  labelB=""
                  toggled={includeRetired}
                  onToggle={resetPage(setIncludeRetired)}
                />
                <Toggle
                  id="dictionary-used"
                  size="sm"
                  labelText={t('usedInFormsOnly', 'Used in forms only')}
                  labelA=""
                  labelB=""
                  toggled={usedInFormsOnly}
                  disabled={!usage}
                  onToggle={resetPage(setUsedInFormsOnly)}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  <TableExpandHeader {...getExpandHeaderProps()} />
                  {headers.map((header) => (
                    <TableHeader
                      key={header.key}
                      isSortable
                      sortDirection={sort.key === header.key ? sort.direction : 'NONE'}
                      onClick={() => toggleSort(header.key)}
                    >
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row) => {
                  const concept = pageRows.find((c) => c.uuid === row.id);
                  const forms = usage?.get(row.id.toLowerCase()) ?? [];
                  return (
                    <React.Fragment key={row.id}>
                      <TableExpandRow {...getRowProps({ row })}>
                        <TableCell>{concept?.name}</TableCell>
                        <TableCell className={styles.synonyms}>
                          {(() => {
                            const others = concept ? synonymsOf(concept) : [];
                            return others.length > 3
                              ? `${others.slice(0, 3).join(', ')} ${t('andMore', '+{{count}} more', { count: others.length - 3 })}`
                              : others.join(', ');
                          })()}
                        </TableCell>
                        <TableCell>{concept?.className}</TableCell>
                        <TableCell>{concept?.datatype}</TableCell>
                        <TableCell>{usageLoading ? '...' : concept ? usedInCount(concept, usage) : ''}</TableCell>
                        <TableCell>
                          {concept?.retired ? (
                            <Tag type="red" size="sm">
                              {t('retired', 'Retired')}
                            </Tag>
                          ) : (
                            <Tag type="green" size="sm">
                              {t('active', 'Active')}
                            </Tag>
                          )}
                        </TableCell>
                      </TableExpandRow>
                      {row.isExpanded && (
                        <TableExpandedRow colSpan={headers.length + 1}>
                          <ConceptDetails uuid={row.id} usedIn={forms} />
                        </TableExpandedRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {!fromDatabase && isLoading && (
              <InlineLoading className={styles.empty} description={t('searching', 'Searching')} />
            )}
            {!isLoading && filtered.length === 0 && (fromDatabase || searchTerm.trim().length >= MIN_QUERY) && (
              <p className={styles.empty}>{t('noConceptsMatch', 'No concepts match these filters.')}</p>
            )}
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              totalItems={filtered.length}
              size={size}
              onChange={({ page: p, pageSize: ps }) => {
                setPage(p);
                setPageSize(ps);
              }}
            />
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};

export default ConceptDictionary;
