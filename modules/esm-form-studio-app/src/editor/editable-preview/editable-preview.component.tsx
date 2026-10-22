/**
 * The editable preview: the form drawn page by page from the schema, with a pencil (edit), a bin
 * (delete) and + (add) on every page, section and question. They open the Interactive Builder's own dialogs
 * (registered as form-studio-* in routes.json), so every builder feature works here too. Each item knows its
 * place in the schema (page, section, question and sub-question numbers), which is what those dialogs need.
 *
 * Why not draw the buttons over the real form engine: the engine has no anchors for sections and doesn't draw
 * hidden or empty items. Its real preview stays on the right-hand Preview tab.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Tag, Tile } from '@carbon/react';
import { Add, Edit, Repeat, Rule, TrashCan } from '@carbon/react/icons';
import { labelsFor, ruleSentences } from '../../logic/question-rules';
import { showModal } from '@openmrs/esm-framework';
import FieldPreview, { type PreviewQuestion } from './field-preview.component';
import styles from './editable-preview.scss';

/** The parts of a schema the preview reads. Kept loose: the builder's dialogs own the full shape. */
export interface PreviewSchema {
  name?: string;
  pages?: Array<{
    label?: string;
    sections?: Array<{ label?: string; isExpanded?: string | boolean; questions?: Array<PreviewQuestion> }>;
  }>;
  [key: string]: unknown;
}

interface EditablePreviewProps {
  /** the form being edited (the builder's schema type or Form Studio's; only PreviewSchema's parts are read) */
  schema?: object;
  /** receives the schema the builder's dialogs produce */
  onSchemaChange: (schema: PreviewSchema) => void;
}

/** What "Add repeating group" starts from: an obsGroup with the 'repeating' rendering and no questions yet. */
export const newRepeatingGroup = () => ({
  id: '',
  label: '',
  type: 'obsGroup',
  questionOptions: { rendering: 'repeating', concept: '' },
  questions: [],
});

/** A question whose concept still needs choosing (converters write __UNMAPPED__ placeholders). */
export const needsConcept = (question: PreviewQuestion) => {
  const concept = question.questionOptions?.concept;
  const isObs = question.type === 'obs' || question.type === 'obsGroup';
  return isObs && (!concept || String(concept).startsWith('__UNMAPPED__'));
};

const EditablePreview: React.FC<EditablePreviewProps> = ({ schema: form, onSchemaChange }) => {
  const { t } = useTranslation();
  const schema = form as PreviewSchema | undefined;
  const labels = useMemo(() => labelsFor(schema ?? {}), [schema]);

  // every dialog gets the same three things it gets inside the Interactive Builder
  const open = (modal: string, props: Record<string, unknown> = {}) => {
    const dispose = showModal(`form-studio-${modal}`, {
      closeModal: () => dispose(),
      schema,
      onSchemaChange,
      ...props,
    });
  };

  if (!schema?.pages) {
    return (
      <Tile className={styles.empty}>
        <p>{t('nothingToPreview', 'Nothing to preview yet.')}</p>
        <p className={styles.helper}>
          {t('nothingToPreviewHelp', 'Fill in the basics, or paste a JSON in the schema editor and render it.')}
        </p>
      </Tile>
    );
  }

  const renderQuestion = (
    question: PreviewQuestion,
    pageIndex: number,
    sectionIndex: number,
    questionIndex: number,
    subQuestionIndex?: number,
  ) => {
    const where = { pageIndex, sectionIndex, questionIndex, subQuestionIndex };
    const isGroup = Array.isArray(question.questions);
    return (
      <div
        key={`${question.id}-${subQuestionIndex ?? questionIndex}`}
        className={isGroup ? styles.group : styles.question}
        data-testid={`preview-question-${question.id}`}
      >
        <div className={styles.questionBody}>
          {isGroup ? <p className={styles.groupLabel}>{question.label}</p> : <FieldPreview question={question} />}
          <div className={styles.tags}>
            {isGroup && question.questionOptions?.rendering === 'repeating' && (
              <Tag size="sm" type="teal" renderIcon={Repeat}>
                {t('repeatingGroup', 'Repeating group')}
              </Tag>
            )}
            {needsConcept(question) && (
              <Tag size="sm" type="red">
                {t('conceptNotMapped', 'Concept not mapped')}
              </Tag>
            )}
          </div>
          {/* the question's rules in plain words */}
          {ruleSentences(question, labels).map((rule, i) => (
            <p key={i} className={rule.kind === 'custom' ? styles.ruleCustom : styles.rule}>
              {rule.text}
            </p>
          ))}
        </div>
        <div className={styles.actions}>
          <IconButton
            kind="ghost"
            size="sm"
            label={t('editQuestion', 'Edit question')}
            onClick={() => open('question-modal', { formField: question, ...where })}
          >
            <Edit />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            label={t('questionRules', 'Rules: when it shows, warnings, format, worked out')}
            onClick={() => open('question-rules-modal', where)}
          >
            <Rule />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            label={t('deleteQuestion', 'Delete question')}
            onClick={() => open('delete-question-modal', { question, ...where })}
          >
            <TrashCan />
          </IconButton>
        </div>
        {isGroup && (
          <div className={styles.groupBody}>
            {question.questions.map((child, childIndex) =>
              renderQuestion(child, pageIndex, sectionIndex, questionIndex, childIndex),
            )}
            {/* grouped questions are added in the group's own dialog ("Add a grouped question") */}
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Add}
              onClick={() => open('question-modal', { formField: question, ...where })}
            >
              {t('addQuestionToGroup', 'Add a question to this group')}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.preview}>
      <h3 className={styles.formName}>{schema.name || t('untitledForm', 'Untitled form')}</h3>
      {schema.pages.map((page, pageIndex) => (
        <section key={pageIndex} className={styles.page} data-testid={`preview-page-${pageIndex}`}>
          <div className={styles.header}>
            <h4 className={styles.pageLabel}>{page.label}</h4>
            <div className={styles.actions}>
              <IconButton
                kind="ghost"
                size="sm"
                label={t('editPage', 'Edit page')}
                onClick={() => open('page-label-modal', { pageIndex })}
              >
                <Edit />
              </IconButton>
              <IconButton
                kind="ghost"
                size="sm"
                label={t('deletePage', 'Delete page')}
                onClick={() => open('delete-page-modal', { pageIndex })}
              >
                <TrashCan />
              </IconButton>
            </div>
          </div>

          {(page.sections ?? []).map((section, sectionIndex) => (
            <div key={sectionIndex} className={styles.section}>
              <div className={styles.header}>
                <h5 className={styles.sectionLabel}>{section.label}</h5>
                <div className={styles.actions}>
                  <IconButton
                    kind="ghost"
                    size="sm"
                    label={t('editSection', 'Edit section')}
                    onClick={() => open('new-section-modal', { pageIndex, sectionIndex, modalType: 'edit' })}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton
                    kind="ghost"
                    size="sm"
                    label={t('deleteSection', 'Delete section')}
                    onClick={() => open('delete-section-modal', { pageIndex, sectionIndex })}
                  >
                    <TrashCan />
                  </IconButton>
                </div>
              </div>
              {(section.questions ?? []).map((question, questionIndex) =>
                renderQuestion(question, pageIndex, sectionIndex, questionIndex),
              )}
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Add}
                onClick={() => open('question-modal', { pageIndex, sectionIndex })}
              >
                {t('addQuestion', 'Add question')}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Repeat}
                onClick={() =>
                  open('question-modal', {
                    // an empty repeating group, appended to the section: the builder's dialog fills it in (its
                    // "Add a grouped question" adds the questions). Its concept must be an existing set concept.
                    formField: newRepeatingGroup(),
                    pageIndex,
                    sectionIndex,
                    questionIndex: (section.questions ?? []).length,
                  })
                }
              >
                {t('addRepeatingGroup', 'Add repeating group')}
              </Button>
            </div>
          ))}
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => open('new-section-modal', { pageIndex })}>
            {t('addSection', 'Add section')}
          </Button>
        </section>
      ))}
      <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => open('new-page-modal')}>
        {t('addPage', 'Add page')}
      </Button>
    </div>
  );
};

export default EditablePreview;
