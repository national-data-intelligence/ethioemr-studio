/**
 * The forms list, laid out like the Form Builder's dashboard table (filter, search, sortable columns, Yes/No tags,
 * pagination). Its Retire and Restore buttons are left out on purpose: they write to the server, and Form Studio never
 * does. Edit opens the editor with the form's identity locked; Download saves the form JSON as it is on the server.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  DataTableSkeleton,
  Dropdown,
  IconButton,
  InlineLoading,
  InlineNotification,
  Link,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react';
import { Download, Edit } from '@carbon/react/icons';
import { showSnackbar } from '@openmrs/esm-framework';
import { fetchFormSchema, type FormSummary, useForms } from '../api/forms.resource';
import { exportFileName } from '../editor/form-studio-panel.component';
import styles from './forms-table.scss';

export const FORM_FILTERS = ['Active', 'All', 'Published', 'Unpublished', 'Retired'] as const;
export type FormFilter = (typeof FORM_FILTERS)[number];

/** Same filter meanings as the Form Builder's dashboard. */
export function filterForms(forms: Array<FormSummary>, filter: FormFilter, search: string) {
  const byStatus = forms.filter((form) => {
    switch (filter) {
      case 'Active':
        return !form.retired;
      case 'Published':
        return form.published && !form.retired;
      case 'Unpublished':
        return !form.published && !form.retired;
      case 'Retired':
        return form.retired;
      default:
        return true;
    }
  });
  const q = search.trim().toLowerCase();
  return q ? byStatus.filter((form) => form.name.toLowerCase().includes(q)) : byStatus;
}

const YesNo: React.FC<{ value: boolean; invertTone?: boolean }> = ({ value, invertTone }) => {
  const { t } = useTranslation();
  return value ? (
    <Tag type={invertTone ? 'red' : 'green'}>{t('yes', 'Yes')}</Tag>
  ) : (
    <Tag type="cool-gray">{t('no', 'No')}</Tag>
  );
};

const FormsTable: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { forms, error, isLoading, isValidating } = useForms({ includeRetired: true });
  const [filter, setFilter] = useState<FormFilter>('Active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const shown = useMemo(() => filterForms(forms, filter, search), [forms, filter, search]);
  const byUuid = useMemo(() => new Map(forms.map((form) => [form.uuid, form])), [forms]);
  const pageRows = shown.slice((page - 1) * pageSize, page * pageSize).map((form) => ({
    id: form.uuid,
    name: form.name,
    version: form.version,
    published: form.published,
    retired: form.retired,
    actions: form.uuid,
  }));

  const headers = [
    { key: 'name', header: t('name', 'Name') },
    { key: 'version', header: t('version', 'Version') },
    { key: 'published', header: t('published', 'Published') },
    { key: 'retired', header: t('retired', 'Retired') },
    { key: 'actions', header: t('schemaActions', 'Schema actions') },
  ];

  const download = async (form: FormSummary) => {
    try {
      const schema = await fetchFormSchema(form);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(schema, null, 2) + '\n'], { type: 'application/json' }));
      link.download = exportFileName(form.name);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      showSnackbar({ kind: 'error', title: t('couldNotDownload', 'Could not download the form'), subtitle: String(e) });
    }
  };

  if (isLoading) {
    return <DataTableSkeleton role="progressbar" columnCount={5} rowCount={10} />;
  }
  if (error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        title={t('couldNotLoadForms', 'Could not load forms')}
        subtitle={error.message}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.filterRow}>
        <Dropdown
          id="formStatusFilter"
          type="inline"
          size="sm"
          label=""
          titleText={t('filterBy', 'Filter by') + ':'}
          items={[...FORM_FILTERS]}
          selectedItem={filter}
          onChange={({ selectedItem }) => {
            setFilter(selectedItem as FormFilter);
            setPage(1);
          }}
        />
        {isValidating && <InlineLoading />}
      </div>
      <DataTable rows={pageRows} headers={headers} size="sm" useZebraStyles isSortable>
        {({ rows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
          <TableContainer data-testid="forms-table">
            {/* the app shell positions the toolbar absolutely; this wrapper reserves its height (as the Form Builder does) */}
            <div className={styles.toolbarWrapper}>
              <TableToolbar size="sm">
                <TableToolbarContent className={styles.toolbar}>
                  <TableToolbarSearch
                    expanded
                    size="sm"
                    persistent
                    placeholder={t('searchThisList', 'Search this list')}
                    onChange={(e) => {
                      setSearch(typeof e === 'string' ? e : e.target.value);
                      setPage(1);
                    }}
                  />
                </TableToolbarContent>
              </TableToolbar>
            </div>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => (
                    <TableHeader {...getHeaderProps({ header, isSortable: header.key !== 'actions' })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const form = byUuid.get(row.id);
                  return (
                    <TableRow {...getRowProps({ row })} key={row.id}>
                      {row.cells.map((cell) => {
                        const column = cell.info.header;
                        let content: React.ReactNode = String(cell.value ?? '');
                        if (column === 'name') {
                          content = (
                            <Link href="#" onClick={(e) => (e.preventDefault(), navigate(`/edit/${row.id}`))}>
                              {String(cell.value)}
                            </Link>
                          );
                        } else if (column === 'published') {
                          content = <YesNo value={Boolean(cell.value)} />;
                        } else if (column === 'retired') {
                          content = <YesNo value={Boolean(cell.value)} invertTone />;
                        } else if (column === 'actions' && form) {
                          content = (
                            <div className={styles.actions}>
                              <IconButton
                                kind="ghost"
                                size="sm"
                                label={t('editSchema', 'Edit schema')}
                                onClick={() => navigate(`/edit/${form.uuid}`)}
                              >
                                <Edit />
                              </IconButton>
                              <IconButton
                                kind="ghost"
                                size="sm"
                                label={t('downloadSchema', 'Download schema')}
                                onClick={() => download(form)}
                              >
                                <Download />
                              </IconButton>
                            </div>
                          );
                        }
                        return <TableCell key={cell.id}>{content}</TableCell>;
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      {shown.length === 0 ? (
        <Tile className={styles.empty}>
          <p>{t('noMatchingFormsToDisplay', 'No matching forms to display')}</p>
          <p className={styles.helper}>{t('checkFilters', 'Check the filters above')}</p>
        </Tile>
      ) : (
        <Pagination
          page={page}
          pageSize={pageSize}
          pageSizes={[10, 25, 50, 100]}
          totalItems={shown.length}
          size="sm"
          onChange={({ page: next, pageSize: size }) => {
            setPage(next);
            setPageSize(size);
          }}
        />
      )}
    </div>
  );
};

export default FormsTable;
