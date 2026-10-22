/**
 * "Rules": every rule in the form as plain sentences, page by page, so a reviewer can read the form's logic in one
 * place. "Edit rules" opens the same dialog as the rules button on a question.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tag, Tile } from '@carbon/react';
import { Rule } from '@carbon/react/icons';
import { showModal } from '@openmrs/esm-framework';
import { labelsFor, type RuleQuestion, ruleSentences } from './question-rules';
import styles from './rules-overview.scss';

interface Schema {
  pages?: Array<{ label?: string; sections?: Array<{ label?: string; questions?: Array<RuleQuestion> }> }>;
}

const RulesOverview: React.FC<{ schema?: object; onSchemaChange: (schema: unknown) => void }> = ({
  schema: form,
  onSchemaChange,
}) => {
  const { t } = useTranslation();
  const schema = form as Schema | undefined;
  const labels = useMemo(() => labelsFor(schema ?? {}), [schema]);
  const rows = useMemo(() => {
    const out: Array<{ where: string; q: RuleQuestion; at: Record<string, number> }> = [];
    schema?.pages?.forEach((page, pageIndex) =>
      page.sections?.forEach((section, sectionIndex) =>
        section.questions?.forEach((q, questionIndex) => {
          out.push({ where: `${page.label} › ${section.label}`, q, at: { pageIndex, sectionIndex, questionIndex } });
          q.questions?.forEach((child, subQuestionIndex) =>
            out.push({
              where: `${page.label} › ${section.label} › ${q.label}`,
              q: child,
              at: { pageIndex, sectionIndex, questionIndex, subQuestionIndex },
            }),
          );
        }),
      ),
    );
    return out.map((r) => ({ ...r, sentences: ruleSentences(r.q, labels) })).filter((r) => r.sentences.length);
  }, [schema, labels]);

  if (!schema?.pages) {
    return <Tile className={styles.tile}>{t('nothingToPreview', 'Nothing to preview yet.')}</Tile>;
  }
  const handWritten = rows.filter((r) => r.sentences.some((s) => s.kind === 'custom')).length;

  return (
    <div className={styles.overview}>
      <p className={styles.intro}>
        {t(
          'rulesIntro',
          'What this form does on its own: which questions appear when, which values get a warning, and what fills in by itself.',
        )}
      </p>
      <div className={styles.summary}>
        <Tag type="teal">{t('questionsWithRules', '{{count}} questions with rules', { count: rows.length })}</Tag>
        {handWritten > 0 && (
          <Tag type="cool-gray">
            {t('handWrittenCount', '{{count}} written by hand (kept as they are)', { count: handWritten })}
          </Tag>
        )}
      </div>
      {rows.length === 0 && (
        <Tile className={styles.tile}>
          {t('noRulesYet', 'No rules yet. Use the rules button on a question to add one.')}
        </Tile>
      )}
      {rows.map((r, i) => (
        <Tile key={i} className={styles.row}>
          <div>
            <p className={styles.where}>{r.where}</p>
            <p className={styles.label}>{r.q.label}</p>
            {r.sentences.map((s, j) => (
              <p key={j} className={s.kind === 'custom' ? styles.custom : styles.sentence}>
                {s.text}
              </p>
            ))}
          </div>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Rule}
            onClick={() => {
              const dispose = showModal('form-studio-question-rules-modal', {
                closeModal: () => dispose(),
                schema,
                onSchemaChange,
                ...r.at,
              });
            }}
          >
            {t('editRules', 'Edit rules')}
          </Button>
        </Tile>
      ))}
    </div>
  );
};

export default RulesOverview;
