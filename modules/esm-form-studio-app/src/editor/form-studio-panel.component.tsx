/**
 * Form Studio's panel inside the Form Builder's editor page. It replaces the Form Builder's Save and Publish
 * buttons, which write to the server database.
 *
 * The form's identity (locked for a form that already ships), the Check (src/check/), new concepts for what is
 * still unmatched, and Export (src/export/): the content files download only
 * when the identity is intact, the Check has no errors, and the concept check ran on exactly this version.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNotification, Tag, Tile } from '@carbon/react';
import { Add, Download, Locked } from '@carbon/react/icons';
import { showModal } from '@openmrs/esm-framework';
import CheckResults, { useFormCheck } from '../check/check-results.component';
import { contentBundle, exportFileName, formJson } from '../export/content-files';
import { creatableMissing, isCielCode, loadNewConcepts, proposeNewConcepts } from '../export/new-concepts';
import { identityViolations } from '../form-model/identity';
import { type FormDraft, type FormSchema } from '../form-model/types';
import styles from './form-studio-panel.scss';
import { plainText } from '../plain-text';

export { exportFileName };

interface FormStudioPanelProps {
  /** the schema being edited */
  schema: unknown;
  /** the schema as loaded from the server (undefined for a new form) */
  original?: unknown;
  /** the server's form record (undefined for a new form) */
  form?: { uuid?: string; name?: string; version?: string; encounterType?: { display?: string; name?: string } };
  /** receives the schema after new concepts replace its placeholders */
  onSchemaChange?: (schema: unknown) => void;
}

const save = (data: string | Uint8Array, type: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
};

const FormStudioPanel: React.FC<FormStudioPanelProps> = ({ schema, original, form, onSchemaChange }) => {
  const { t } = useTranslation();
  const current = (schema ?? {}) as FormSchema;
  const shipped = original && Object.keys(original as object).length > 0 ? (original as FormSchema) : undefined;
  const draft: FormDraft = shipped
    ? { mode: 'edit', schema: current, original: shipped }
    : { mode: 'new', schema: current };
  const problems = current?.pages ? identityViolations(draft) : [];

  // new concepts confirmed for this form, still used by it (they're created by the export, not on the server)
  const storeKey = current?.uuid || 'new-form';
  const text = useMemo(() => JSON.stringify(schema ?? null), [schema]);
  const newConcepts = useMemo(
    () => loadNewConcepts(storeKey).filter((c) => text.includes(`"${c.uuid}"`)),
    [storeKey, text],
  );
  const pending = useMemo(() => new Map(newConcepts.map((c) => [c.uuid, c.name])), [newConcepts]);
  const check = useFormCheck(current?.pages ? schema : undefined, pending);
  // concepts the form points at that this EMR doesn't have (the server check): ours can be created with the same
  // code; CIEL ones come from CIEL and are only reported
  const missing = useMemo(
    () =>
      check.issues
        .filter((i) => (i.rule === 'concept-missing' || i.rule === 'answer-missing') && i.detail?.value)
        .map((i) => i.detail.value),
    [check.issues],
  );
  const missingToCreate = useMemo(() => creatableMissing(missing), [missing]);
  const missingCiel = useMemo(() => [...new Set(missing.filter(isCielCode))], [missing]);
  const toCreate = useMemo(
    () =>
      schema && (schema as FormSchema).pages
        ? proposeNewConcepts(schema as FormSchema, undefined, missingToCreate).length
        : 0,
    [schema, missingToCreate],
  );

  const blockedBy = problems.length
    ? t('blockedIdentity', 'Fix the identity first.')
    : check.errors
      ? t('blockedErrors', 'Fix the Check errors first.')
      : !check.serverChecked
        ? t('blockedNotChecked', 'Check the concepts on the server first.')
        : undefined;

  const openNewConcepts = () => {
    const dispose = showModal('form-studio-new-concepts-modal', {
      closeModal: () => dispose(),
      schema,
      onSchemaChange,
      missing: [...missingToCreate],
    });
  };

  return (
    <Tile className={styles.panel}>
      <div className={styles.identity}>
        <div>
          <p className={styles.name}>{current?.name || t('untitledForm', 'Untitled form')}</p>
          <p className={styles.meta}>
            {[
              current?.uuid || t('uuidAssignedAtExport', 'uuid assigned at export'),
              current?.encounter || form?.encounterType?.display || t('noEncounterType', 'no encounter type'),
              t('versionValue', 'version {{version}}', { version: current?.version ?? '-' }),
            ].join(' · ')}
          </p>
        </div>
        {shipped ? (
          <Tag type="blue" renderIcon={Locked}>
            {t('identityLockedShort', 'Identity locked')}
          </Tag>
        ) : (
          <Tag type="green">{t('newForm', 'New form')}</Tag>
        )}
      </div>

      {problems.length > 0 &&
        problems.map((problem) => (
          <InlineNotification
            key={problem}
            kind="error"
            lowContrast
            hideCloseButton
            title={t('identityGateFailed', 'Identity: must fix.')}
            subtitle={problem}
          />
        ))}

      {current?.pages && <CheckResults check={check} />}

      {toCreate > 0 && onSchemaChange && (
        <div className={styles.actions}>
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={openNewConcepts}>
            {t('createNewConceptsCount', 'Create new concepts ({{count}} missing)', { count: toCreate })}
          </Button>
          <p className={styles.meta}>
            {t(
              'createNewConceptsHint',
              'For questions with no concept yet, and concepts this form uses that this EMR does not have. Only after the question pencil found nothing to reuse.',
            )}
          </p>
        </div>
      )}

      {missingCiel.length > 0 && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={t('missingCielTitle', '{{count}} CIEL concepts are missing on this EMR', {
            count: missingCiel.length,
          })}
          subtitle={t(
            'missingCielHelp',
            'They come from the CIEL dictionary, so Form Studio never creates them. Ask the dictionary owner to load them: {{codes}}',
            { codes: missingCiel.slice(0, 6).join(', ') + (missingCiel.length > 6 ? ' …' : ''), ...plainText },
          )}
        />
      )}

      <div className={styles.actions}>
        <Button
          kind="primary"
          size="sm"
          renderIcon={Download}
          disabled={Boolean(blockedBy)}
          onClick={() =>
            save(
              contentBundle(current, newConcepts, Boolean(shipped)),
              'application/zip',
              exportFileName(current?.name).replace(/\.json$/, '-content.zip'),
            )
          }
        >
          {t('downloadContentFiles', 'Download content files')}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          disabled={Boolean(blockedBy)}
          onClick={() => save(formJson(schema), 'application/json', exportFileName(current?.name))}
        >
          {t('formJsonOnly', 'Form JSON only')}
        </Button>
        <p className={styles.meta}>
          {blockedBy ??
            (newConcepts.length
              ? t(
                  'exportHintConcepts',
                  'The zip holds the form and {{count}} new concept rows, laid out like the content repository, with a README.',
                  {
                    count: newConcepts.length,
                  },
                )
              : t(
                  'exportHintZip',
                  'The zip holds the form laid out like the content repository, with a README. Nothing is saved to the server.',
                ))}
        </p>
      </div>
    </Tile>
  );
};

export default FormStudioPanel;
