/**
 * "From a Bahmni export" and "From an Excel template": upload, convert, match concepts against this server,
 * review what came out, then open it in the editor (rendered, editable). Nothing is saved anywhere.
 * Steps: upload, working (read, match concepts n of N), review (identity, numbers, issues), editor.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionItem,
  Button,
  ComboBox,
  FileUploaderDropContainer,
  InlineNotification,
  Link,
  ProgressBar,
  Stack,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { ArrowLeft, ArrowRight, Download } from '@carbon/react/icons';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { useEncounterTypes, type EncounterType } from '../api/encounter-types.resource';
import { fetchFormSchema, type FormSummary, useForms } from '../api/forms.resource';
import { countWords } from '../editor/form-metadata.modal';
import { newFormUuid } from '../form-model/standard-template';
import { type FormSchema } from '../form-model/types';
import { readBahmniZip } from './bahmni/read-bahmni';
import { readExcelFile } from './excel/read-excel';
import { buildSchema } from './build-schema';
import { matchConcepts } from './match-concepts';
import { type IntakeForm, type IntakeIssue } from './intake-types';
import styles from './intake-page.scss';
import { plainText } from '../plain-text';

const TEMPLATE_URL = new URL('./excel/assets/Form_Studio_Template.xlsx', import.meta.url).href;
const EXAMPLE_URL = new URL('./excel/assets/Example_Cardiac_History_Sheet.xlsx', import.meta.url).href;

type Stage =
  | { step: 'upload' }
  | { step: 'working'; message: string; done?: number; total?: number }
  | { step: 'review'; intake: IntakeForm }
  | { step: 'failed'; message: string };

/** A form on the server this intake rebuilds: by "Replaces" (name or uuid) or by the same name. */
export function findReplaced(forms: Array<FormSummary>, intake: Pick<IntakeForm, 'name' | 'replaces'>) {
  const wanted = (intake.replaces || intake.name || '').trim().toLowerCase();
  return forms.find((form) => form.uuid.toLowerCase() === wanted || form.name.trim().toLowerCase() === wanted);
}

const IntakePage: React.FC<{ source: 'bahmni' | 'excel' }> = ({ source }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { allowedEncounterTypeUuids, blockedQuestionConceptClasses, descriptionWordRange } = useConfig<Config>();
  const { encounterTypes } = useEncounterTypes();
  const { forms } = useForms({ includeRetired: true });
  const [stage, setStage] = useState<Stage>({ step: 'upload' });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [encounter, setEncounter] = useState<EncounterType | null>(null);

  const allowedTypes = useMemo(
    () =>
      allowedEncounterTypeUuids?.length
        ? encounterTypes.filter((type) => allowedEncounterTypeUuids.includes(type.uuid))
        : encounterTypes,
    [encounterTypes, allowedEncounterTypeUuids],
  );

  const handleFile = async (file: File) => {
    try {
      setStage({ step: 'working', message: t('readingFile', 'Reading {{file}}', { file: file.name, ...plainText }) });
      const intake =
        source === 'bahmni'
          ? readBahmniZip(new Uint8Array(await file.arrayBuffer()), file.name)
          : await readExcelFile(file);
      if (intake.problems.some((p) => p.level === 'error') && !intake.pages.length) {
        setStage({ step: 'failed', message: intake.problems.map((p) => p.message).join(' ') });
        return;
      }
      // rebuilding a shipped form: its own questions' concepts come first (continuity)
      const replacedForm = findReplaced(forms, intake);
      const shipped = replacedForm ? await fetchFormSchema(replacedForm).catch(() => undefined) : undefined;
      await matchConcepts(intake, {
        shipped,
        blockedClasses: blockedQuestionConceptClasses ?? [],
        onProgress: (done, total) =>
          setStage({
            step: 'working',
            message: t('matchingConcepts', 'Matching concepts on this server'),
            done,
            total,
          }),
      });
      setName(intake.name);
      setDescription(intake.description ?? '');
      const wanted = (intake.encounter || (source === 'bahmni' ? 'Consultation' : '')).toLowerCase();
      setEncounter(allowedTypes.find((type) => type.name.toLowerCase() === wanted) ?? null);
      setStage({ step: 'review', intake });
    } catch (e) {
      setStage({ step: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const review = stage.step === 'review' ? stage.intake : undefined;
  const replaced = review ? findReplaced(forms, { name, replaces: review.replaces }) : undefined;
  const built = useMemo(() => {
    if (!review) return undefined;
    return buildSchema(structuredClone(review), {
      name: replaced?.name ?? name,
      uuid: replaced?.uuid ?? (name.trim() ? newFormUuid(name) : ''),
      encounter: replaced?.encounterType?.name ?? encounter?.name ?? '',
      description,
      version: replaced?.version ?? review.version,
    });
  }, [review, replaced, name, encounter, description]);

  const openInEditor = () => {
    navigate('/new', { state: { importedSchema: built.schema as FormSchema } });
  };

  const title =
    source === 'bahmni'
      ? t('fromBahmniExport', 'From a Bahmni export')
      : t('fromExcelTemplate', 'From an Excel template');
  const byLevel = (level: IntakeIssue['level']) => built?.issues.filter((issue) => issue.level === level) ?? [];

  return (
    <div className={styles.page}>
      <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={() => navigate('/')}>
        {t('back', 'Back')}
      </Button>
      <h2 className={styles.heading}>{title}</h2>

      {stage.step === 'upload' && (
        <Tile className={styles.tile}>
          <p>
            {source === 'bahmni'
              ? t(
                  'bahmniUploadExplainer',
                  'Upload the zip Bahmni exports for one form (concepts.csv and concept_sets.csv). Form Studio builds the form, matches each concept on this server and shows you what needs a decision.',
                )
              : t(
                  'excelUploadExplainer',
                  'Fill the Form Studio template (one row per question), then upload it. Form Studio builds the form, matches each concept on this server and shows you what needs a decision.',
                )}
          </p>
          {source === 'excel' && (
            <div className={styles.downloads}>
              <Link href={TEMPLATE_URL} download="Form_Studio_Template.xlsx" renderIcon={Download}>
                {t('downloadTemplate', 'Download the empty template')}
              </Link>
              <Link href={EXAMPLE_URL} download="Example_Cardiac_History_Sheet.xlsx" renderIcon={Download}>
                {t('downloadExample', 'Download a filled example (Cardiac History Sheet)')}
              </Link>
            </div>
          )}
          <FileUploaderDropContainer
            accept={source === 'bahmni' ? ['.zip'] : ['.xlsx']}
            labelText={
              source === 'bahmni'
                ? t('dropBahmniZip', 'Drag the Bahmni export (.zip) here or click to choose it')
                : t('dropExcel', 'Drag the filled template (.xlsx) here or click to choose it')
            }
            multiple={false}
            onAddFiles={(_e: unknown, { addedFiles }: { addedFiles: Array<File> }) =>
              addedFiles[0] && handleFile(addedFiles[0])
            }
          />
        </Tile>
      )}

      {stage.step === 'working' && (
        <Tile className={styles.tile}>
          <ProgressBar
            label={stage.message}
            value={stage.total ? stage.done : undefined}
            max={stage.total || undefined}
            helperText={stage.total ? t('questionsMatched', '{{done}} of {{total}} questions', stage) : undefined}
          />
        </Tile>
      )}

      {stage.step === 'failed' && (
        <>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('couldNotRead', 'Could not read the file')}
            subtitle={stage.message}
          />
          <Button kind="secondary" onClick={() => setStage({ step: 'upload' })}>
            {t('tryAnotherFile', 'Try another file')}
          </Button>
        </>
      )}

      {review && built && (
        <div className={styles.review}>
          <Tile className={styles.tile}>
            <Stack gap={5}>
              <h3 className={styles.subheading}>{t('theForm', 'The form')}</h3>
              {replaced ? (
                <InlineNotification
                  kind="info"
                  lowContrast
                  hideCloseButton
                  title={t('rebuildsExisting', 'Rebuilds "{{name}}"', { name: replaced.name, ...plainText })}
                  // the identity is kept: a new uuid under a shipped name makes the loader retire the deployed form
                  subtitle={t(
                    'rebuildsExistingExplainer',
                    'A form with this name already exists, so its uuid, name, encounter type and version are kept.',
                  )}
                />
              ) : null}
              <TextInput
                id="intakeName"
                labelText={t('formName', 'Form name')}
                value={replaced?.name ?? name}
                readOnly={Boolean(replaced)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
              <ComboBox
                id="intakeEncounter"
                titleText={t('encounterType', 'Encounter type')}
                items={allowedTypes}
                itemToString={(item: EncounterType | null) => item?.name ?? ''}
                selectedItem={
                  replaced ? { uuid: replaced.encounterType?.uuid, name: replaced.encounterType?.name } : encounter
                }
                disabled={Boolean(replaced)}
                onChange={({ selectedItem }: { selectedItem: EncounterType | null }) => setEncounter(selectedItem)}
              />
              <TextArea
                id="intakeDescription"
                labelText={t('formDescription', 'Description')}
                rows={2}
                helperText={t('descriptionWords', '{{words}} words (aim for {{min}}-{{max}})', {
                  words: countWords(description),
                  min: descriptionWordRange?.min ?? 18,
                  max: descriptionWordRange?.max ?? 40,
                })}
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              />
              <p className={styles.helper}>
                {t('uuidLabel', 'uuid')}: {built.schema.uuid || '-'}
              </p>
            </Stack>
          </Tile>

          <Tile className={styles.tile}>
            <h3 className={styles.subheading}>{t('whatCameOut', 'What came out')}</h3>
            <div className={styles.numbers}>
              {[
                [t('pages', 'Pages'), built.stats.pages],
                [t('sections', 'Sections'), built.stats.sections],
                [t('questions', 'Questions'), built.stats.questions],
                [t('conceptsMatched', 'Concepts matched'), built.stats.matched],
                [t('conceptsToPick', 'Concepts to pick'), built.stats.unmatched],
                [t('notBuiltFromEmr', 'Not built (from EMR)'), built.stats.skipped],
              ].map(([label, value]) => (
                <div key={label as string} className={styles.number}>
                  <span className={styles.value}>{value}</span>
                  <span className={styles.helper}>{label}</span>
                </div>
              ))}
            </div>
            <Accordion>
              {(['error', 'warning', 'info'] as const).map((level) =>
                byLevel(level).length ? (
                  <AccordionItem
                    key={level}
                    title={
                      <span>
                        <Tag size="sm" type={level === 'error' ? 'red' : level === 'warning' ? 'warm-gray' : 'blue'}>
                          {byLevel(level).length}
                        </Tag>{' '}
                        {level === 'error'
                          ? t('errors', 'Rows that could not be used')
                          : level === 'warning'
                            ? t('needsDecision', 'Needs a decision in the editor')
                            : t('forInformation', 'For information')}
                      </span>
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
          </Tile>

          <div className={styles.actions}>
            <Button kind="secondary" onClick={() => setStage({ step: 'upload' })}>
              {t('startOver', 'Start over')}
            </Button>
            <Button
              renderIcon={ArrowRight}
              disabled={!built.schema.name || !built.schema.encounter || built.stats.questions === 0}
              onClick={openInEditor}
            >
              {t('openInEditor', 'Open in the editor')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntakePage;
