/**
 * The Check in Form Studio's panel. The checks that need no
 * server run on every change; "Check concepts" asks the server's dictionary. The result says whether the form can
 * be exported: no errors, and the concept check run on exactly this version of the form.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionItem, Button, InlineLoading, Tag } from '@carbon/react';
import { Renew } from '@carbon/react/icons';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { serverConcepts } from '../intake/match-concepts';
import { checkFormConcepts, checkFormOffline, type CheckIssue } from './check-form';
import styles from './check-results.scss';

export interface CheckState {
  /** false while errors remain or the concept check hasn't run on this version */
  exportable: boolean;
  reason?: string;
}

export function useFormCheck(schema: unknown, pending: Map<string, string> = new Map()) {
  const { blockedQuestionConceptClasses } = useConfig<Config>();
  const version = useMemo(() => JSON.stringify(schema ?? null), [schema]);
  const offline = useMemo(() => (schema ? checkFormOffline(schema) : []), [schema]);
  const [server, setServer] = useState<{ version: string; issues: Array<CheckIssue> }>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();

  const runServerCheck = async () => {
    setProgress({ done: 0, total: 1 });
    try {
      const issues = await checkFormConcepts(
        schema,
        serverConcepts(),
        blockedQuestionConceptClasses ?? [],
        (done, total) => setProgress({ done, total }),
        pending,
      );
      setServer({ version, issues });
    } finally {
      setProgress(undefined);
    }
  };

  const serverCurrent = server?.version === version ? server.issues : undefined;
  const issues = [...offline, ...(serverCurrent ?? [])];
  const errors = issues.filter((i) => i.level === 'error').length;
  return { issues, errors, serverChecked: Boolean(serverCurrent), progress, runServerCheck };
}

const CheckResults: React.FC<{ check: ReturnType<typeof useFormCheck> }> = ({ check }) => {
  const { t } = useTranslation();
  const { issues, errors, serverChecked, progress, runServerCheck } = check;
  const warnings = issues.length - errors;
  const byLevel = (level: CheckIssue['level']) => issues.filter((i) => i.level === level);

  return (
    <div className={styles.check}>
      <div className={styles.summary}>
        <span className={styles.title}>{t('check', 'Check')}</span>
        <Tag size="sm" type={errors ? 'red' : 'green'}>
          {t('errorCount', '{{count}} errors', { count: errors })}
        </Tag>
        <Tag size="sm" type="warm-gray">
          {t('warningCount', '{{count}} warnings', { count: warnings })}
        </Tag>
        {serverChecked ? (
          <Tag size="sm" type="blue">
            {t('conceptsChecked', 'Concepts checked')}
          </Tag>
        ) : (
          <Tag size="sm" type="outline">
            {t('conceptsNotChecked', 'Concepts not checked yet')}
          </Tag>
        )}
        {progress ? (
          <InlineLoading description={t('checkingConcepts', 'Checking concepts {{done}}/{{total}}', progress)} />
        ) : (
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={runServerCheck}>
            {serverChecked ? t('checkAgain', 'Check again') : t('checkConcepts', 'Check concepts on the server')}
          </Button>
        )}
      </div>
      {issues.length > 0 && (
        <Accordion size="sm">
          {(['error', 'warning'] as const).map((level) =>
            byLevel(level).length ? (
              <AccordionItem
                key={level}
                title={
                  level === 'error'
                    ? t('mustFixBeforeExport', 'Must fix before export ({{count}})', { count: byLevel(level).length })
                    : t('worthALook', 'Worth a look ({{count}})', { count: byLevel(level).length })
                }
              >
                <ul className={styles.issues}>
                  {byLevel(level).map((issue, i) => (
                    <li key={i}>
                      {issue.where && <strong>{issue.where}: </strong>}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            ) : null,
          )}
        </Accordion>
      )}
    </div>
  );
};

export default CheckResults;
