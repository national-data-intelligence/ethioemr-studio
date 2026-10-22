// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/form-editor/form-editor.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import {
  ActionableNotification,
  Button,
  Column,
  CopyButton,
  Dropdown,
  FileUploader,
  Grid,
  IconButton,
  InlineLoading,
  InlineNotification,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
} from '@carbon/react';
import { ArrowLeft, Maximize, Minimize, Download, Renew } from '@carbon/react/icons';
import { useLocation, useParams } from 'react-router-dom'; // FORM STUDIO: useLocation for imported forms
import { useTranslation } from 'react-i18next';
import { type TFunction } from 'i18next';
import { ConfigurableLink, showModal, showSnackbar, useConfig } from '@openmrs/esm-framework';
// FORM STUDIO: Form Studio's panel (identity, checks, export) replaces the Save and Publish buttons, which write
// to the server database.
import FormStudioPanel from '../../../editor/form-studio-panel.component';
import AuditDetails from '../audit-details/audit-details.component';
import FormRenderer from '../form-renderer/form-renderer.component';
import Header from '../header/header.component';
import InteractiveBuilder from '../interactive-builder/interactive-builder.component';
import TranslationBuilder from '../translation-builder/translation-builder.component';
import SchemaEditor from '../schema-editor/schema-editor.component';
// FORM STUDIO: the left pane switch and the editable preview
import LeftPaneSwitch, { type LeftView } from '../../../editor/left-pane-switch.component';
import EditablePreview from '../../../editor/editable-preview/editable-preview.component';
import RulesOverview from '../../../logic/rules-overview.component';
import ValidationMessage from '../validation-info/validation-info.component';
import { handleFormValidation } from '../../resources/form-validator.resource';
import { mergeTranslatedSchema } from '../../utils/translationSchemaUtils';
// FORM STUDIO: restoring a retired form writes to the server; Form Studio never does.
const unretireForm = async (_formUuid: string): Promise<{ status: number }> => {
  throw new Error('Form Studio does not write to the server. Ship changes as content files (Export) on a branch.');
};
import { useClobdata } from '../../hooks/useClobdata';
import { useForm } from '../../hooks/useForm';
import { useLanguageOptions } from '../../hooks/getLanguageOptionsFromSession';
import type { IMarker } from 'react-ace';
import type { FormSchema } from '@openmrs/esm-form-engine-lib';
import type { Schema } from '../../types';
import type { ConfigObject } from '../../config-schema';
import styles from './form-editor.scss';

interface ErrorProps {
  error: Error;
  title: string;
}

interface TranslationFnProps {
  t: TFunction;
}

interface MarkerProps extends IMarker {
  text: string;
}

type Status = 'idle' | 'formLoaded' | 'schemaLoaded';

const ErrorNotification = ({ error, title }: ErrorProps) => {
  return (
    <InlineNotification
      className={styles.errorNotification}
      kind={'error'}
      lowContrast
      subtitle={error?.message}
      title={title}
    />
  );
};

const FormEditorContent: React.FC<TranslationFnProps> = ({ t }) => {
  const defaultEnterDelayInMs = 300;
  const { formUuid } = useParams<{ formUuid: string }>();
  const { blockRenderingWithErrors, dataTypeToRenderingMap } = useConfig<ConfigObject>();
  const isNewSchema = !formUuid;
  const [schema, setSchema] = useState<Schema>();
  const { form, formError, isLoadingForm, mutate: mutateForm } = useForm(formUuid);
  const { clobdata, clobdataError, isLoadingClobdata } = useClobdata(form);
  const [isRestoringForm, setIsRestoringForm] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [isMaximized, setIsMaximized] = useState(false);
  const [leftView, setLeftView] = useState<LeftView>('preview'); // FORM STUDIO: the left pane opens on the preview
  const [stringifiedSchema, setStringifiedSchema] = useState(schema ? JSON.stringify(schema, null, 2) : '');
  const [validationResponse, setValidationResponse] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationComplete, setValidationComplete] = useState(false);
  const [publishedWithErrors, setPublishedWithErrors] = useState(false);
  const [errors, setErrors] = useState<Array<MarkerProps>>([]);
  const [validationOn, setValidationOn] = useState(false);
  const [invalidJsonErrorMessage, setInvalidJsonErrorMessage] = useState('');
  const languageOptions = useLanguageOptions();
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(() => languageOptions[0]?.code ?? 'en');
  const [shouldMergeTranslation, setShouldMergeTranslation] = useState(false);
  const [renderLangCode, setRenderLangCode] = useState<string | null>(null);

  const isLoadingFormOrSchema = Boolean(formUuid) && (isLoadingClobdata || isLoadingForm);

  const savedSchemaString = useMemo(() => (clobdata ? JSON.stringify(clobdata, null, 2) : ''), [clobdata]);
  const hasSchemaContent =
    Boolean(stringifiedSchema) && stringifiedSchema !== 'undefined' && stringifiedSchema !== 'null';
  const isDirty = hasSchemaContent && stringifiedSchema !== savedSchemaString;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const langCodeForPreview = useMemo(
    () => (shouldMergeTranslation ? renderLangCode : null),
    [shouldMergeTranslation, renderLangCode],
  );

  const resetErrorMessage = useCallback(() => {
    setInvalidJsonErrorMessage('');
  }, []);

  const handleSchemaChange = useCallback(
    (updatedSchema: string) => {
      resetErrorMessage();
      setStringifiedSchema(updatedSchema);
    },
    [resetErrorMessage],
  );

  const updateSchema = useCallback((updatedSchema: FormSchema) => {
    setSchema(updatedSchema);
    localStorage.setItem('formStudioJSON', JSON.stringify(updatedSchema));
  }, []);

  const launchRestoreDraftSchemaModal = useCallback(() => {
    const dispose = showModal('form-studio-restore-draft-schema-modal', {
      closeModal: () => dispose(),
      onSchemaChange: updateSchema,
    });
  }, [updateSchema]);

  const handleRestoreForm = useCallback(async () => {
    if (!form) return;
    setIsRestoringForm(true);
    try {
      const res = await unretireForm(form.uuid);
      if (res.status === 200) {
        showSnackbar({
          title: t('formRestored', 'Form restored'),
          kind: 'success',
          isLowContrast: true,
          subtitle: t('formRestoredMessage', 'The form "{{- formName}}" has been restored', {
            formName: form.name,
          }),
        });
        await mutateForm();
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        showSnackbar({
          title: t('errorRestoringForm', 'Error restoring form'),
          kind: 'error',
          subtitle: e.message,
        });
      }
    } finally {
      setIsRestoringForm(false);
    }
  }, [form, mutateForm, t]);

  useEffect(() => {
    if (formUuid) {
      if (form && Object.keys(form).length > 0) {
        setStatus('formLoaded');
      }

      if (status === 'formLoaded' && !isLoadingClobdata && clobdata === undefined) {
        launchRestoreDraftSchemaModal();
      }

      if (clobdata && Object.keys(clobdata).length > 0) {
        setStatus('schemaLoaded');
        setSchema(clobdata);
        localStorage.setItem('formStudioJSON', JSON.stringify(clobdata));
      }
    }
  }, [clobdata, form, formUuid, isLoadingClobdata, isLoadingFormOrSchema, launchRestoreDraftSchemaModal, status]);

  // FORM STUDIO: "From scratch" first asks for the form's metadata and fills the standard template.
  // Closing the dialog leaves the editor empty, so a JSON can be pasted instead. A form converted by the Bahmni
  // or Excel intake arrives in the route state and opens directly.
  const { state: routeState } = useLocation();
  useEffect(() => {
    if (!isNewSchema) return;
    const imported = (routeState as { importedSchema?: FormSchema } | null)?.importedSchema;
    if (imported) {
      updateSchema(imported);
      return;
    }
    const dispose = showModal('form-studio-form-metadata-modal', {
      closeModal: () => dispose(),
      onCreate: updateSchema,
    });
    return () => dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the route state is read once, on arrival
  }, [isNewSchema, updateSchema]);

  useEffect(() => {
    setStringifiedSchema(JSON.stringify(schema, null, 2));
  }, [schema]);

  const onValidateForm = async () => {
    setIsValidating(true);
    try {
      const [errorsArray] = await handleFormValidation(schema, dataTypeToRenderingMap, t);
      setValidationResponse(errorsArray);
      setValidationComplete(true);
    } catch (error) {
      console.error('Error during form validation:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const inputDummySchema = useCallback(() => {
    const dummySchema: FormSchema = {
      encounterType: '',
      name: 'Sample Form',
      processor: 'EncounterFormProcessor',
      referencedForms: [],
      uuid: '',
      version: '1.0',
      pages: [
        {
          label: 'First Page',
          sections: [
            {
              label: 'A Section',
              isExpanded: 'true',
              questions: [
                {
                  id: 'sampleQuestion',
                  label: 'A Question of type obs that renders a text input',
                  type: 'obs',
                  questionOptions: {
                    rendering: 'text',
                    concept: 'a-system-defined-concept-uuid',
                  },
                },
              ],
            },
            {
              label: 'Another Section',
              isExpanded: 'true',
              questions: [
                {
                  id: 'anotherSampleQuestion',
                  label: 'Another Question of type obs whose answers get rendered as radio inputs',
                  type: 'obs',
                  questionOptions: {
                    rendering: 'radio',
                    concept: 'system-defined-concept-uuid',
                    answers: [
                      {
                        concept: 'another-system-defined-concept-uuid',
                        label: 'Choice 1',
                      },
                      {
                        concept: 'yet-another-system-defined-concept-uuid',
                        label: 'Choice 2',
                      },
                      {
                        concept: 'yet-one-more-system-defined-concept-uuid',
                        label: 'Choice 3',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    setStringifiedSchema(JSON.stringify(dummySchema, null, 2));
    updateSchema({ ...dummySchema });
  }, [updateSchema]);

  const renderSchemaChanges = useCallback(() => {
    resetErrorMessage();
    {
      try {
        const parsedJson: Schema = JSON.parse(stringifiedSchema);
        updateSchema(parsedJson);
        setStringifiedSchema(JSON.stringify(parsedJson, null, 2));
      } catch (e) {
        if (e instanceof Error) {
          setInvalidJsonErrorMessage(e.message);
        }
      }
    }
  }, [stringifiedSchema, updateSchema, resetErrorMessage]);

  const translatedSchema = useMemo(() => {
    if (!schema) return null;
    if (!shouldMergeTranslation) return schema;
    return mergeTranslatedSchema(schema, langCodeForPreview);
  }, [schema, shouldMergeTranslation, langCodeForPreview]);

  const handleRenderSchemaChanges = useCallback(() => {
    if (errors.length && blockRenderingWithErrors) {
      setValidationOn(true);
      return;
    }

    setShouldMergeTranslation(true);
    setRenderLangCode(selectedLanguageCode);
    if (errors.length && !blockRenderingWithErrors) {
      setValidationOn(true);
      renderSchemaChanges();
    } else {
      renderSchemaChanges();
    }
  }, [blockRenderingWithErrors, errors.length, renderSchemaChanges, selectedLanguageCode]);

  const handleSchemaImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        const fileContent: string = result;
        const parsedJson: Schema = JSON.parse(fileContent);
        setSchema(parsedJson);
      } else if (result instanceof ArrayBuffer) {
        const decoder = new TextDecoder();
        const fileContent: string = decoder.decode(result);
        const parsedJson: Schema = JSON.parse(fileContent);
        setSchema(parsedJson);
      }
    };

    reader.readAsText(file);
  };

  const downloadableSchema = useMemo(
    () =>
      new Blob([JSON.stringify(schema, null, 2)], {
        type: 'application/json',
      }),
    [schema],
  );

  const handleCopySchema = useCallback(async () => {
    await navigator.clipboard.writeText(stringifiedSchema);
  }, [stringifiedSchema]);

  const handleToggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const responsiveSize = isMaximized ? 16 : 8;

  return (
    <div className={styles.container}>
      {form?.retired && (
        <ActionableNotification
          className={styles.retiredNotification}
          kind="warning"
          lowContrast
          inline
          hideCloseButton
          title={t('formIsRetired', 'This form is retired.')}
          actionButtonLabel={isRestoringForm ? t('restoring', 'Restoring') : t('restoreForm', 'Restore form')}
          onActionButtonClick={handleRestoreForm}
        />
      )}
      <Grid
        className={classNames(styles.grid as string, {
          [styles.maximized]: isMaximized,
        })}
      >
        <Column lg={responsiveSize} md={responsiveSize} sm={4} className={styles.column}>
          <div className={styles.actionButtons}>
            {isLoadingFormOrSchema ? (
              <InlineLoading description={t('loadingSchema', 'Loading schema') + '...'} />
            ) : (
              <h1 className={styles.formName}>
                {form?.name}
                {isDirty && (
                  <Tag className={styles.dirtyIndicator} type="warm-gray" size="sm">
                    {t('unsavedChanges', 'Unsaved changes')}
                  </Tag>
                )}
              </h1>
            )}
          </div>
          <div>
            <div className={styles.heading}>
              {/* FORM STUDIO: the switch replaces the "Schema editor" heading */}
              <LeftPaneSwitch value={leftView} onChange={setLeftView} />
              <div className={styles.topBtns} style={leftView === 'schema' ? undefined : { display: 'none' }}>
                {!schema ? (
                  <FileUploader
                    onChange={handleSchemaImport}
                    labelTitle=""
                    labelDescription=""
                    buttonLabel={t('importSchema', 'Import schema')}
                    buttonKind="ghost"
                    size="lg"
                    filenameStatus="edit"
                    accept={['.json']}
                    multiple={false}
                    disabled={false}
                    iconDescription={t('importSchema', 'Import schema')}
                    name="form-import"
                  />
                ) : null}
                {isNewSchema && !schema ? (
                  <Button kind="ghost" onClick={inputDummySchema}>
                    {t('inputDummySchema', 'Load sample schema')}
                  </Button>
                ) : null}
                <Dropdown
                  id="target-language"
                  items={languageOptions}
                  itemToString={(item) => item?.label ?? ''}
                  label={t('selectLanguage', 'Select language')}
                  onChange={({ selectedItem }) => {
                    if (selectedItem) setSelectedLanguageCode(selectedItem.code);
                  }}
                  titleText={t('previewFormIn', 'Preview form in')}
                  selectedItem={languageOptions.find((opt) => opt.code === selectedLanguageCode)}
                  type="inline"
                  className={styles.dropdown}
                />

                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Renew}
                  onClick={handleRenderSchemaChanges}
                  disabled={!!invalidJsonErrorMessage}
                >
                  {t('renderChanges', 'Render changes')}
                </Button>
              </div>
              {schema ? (
                <div className={styles.schemaIconActions}>
                  <IconButton
                    enterDelayMs={defaultEnterDelayInMs}
                    kind="ghost"
                    label={
                      isMaximized ? t('minimizeEditor', 'Minimize editor') : t('maximizeEditor', 'Maximize editor')
                    }
                    onClick={handleToggleMaximize}
                    size="md"
                  >
                    {isMaximized ? <Minimize /> : <Maximize />}
                  </IconButton>
                  <CopyButton
                    align="top"
                    className="cds--btn--md"
                    iconDescription={t('copySchema', 'Copy schema')}
                    kind="ghost"
                    onClick={handleCopySchema}
                  />
                  <a download={`${form?.name}.json`} href={window.URL.createObjectURL(downloadableSchema)}>
                    <IconButton
                      enterDelayMs={defaultEnterDelayInMs}
                      kind="ghost"
                      label={t('downloadSchema', 'Download schema')}
                      size="md"
                    >
                      <Download />
                    </IconButton>
                  </a>
                </div>
              ) : null}
            </div>
            {formError ? (
              <ErrorNotification error={formError} title={t('formError', 'Error loading form metadata')} />
            ) : null}
            {clobdataError ? (
              <ErrorNotification error={clobdataError} title={t('schemaLoadError', 'Error loading schema')} />
            ) : null}
            <div className={styles.editorContainer} style={leftView === 'schema' ? undefined : { display: 'none' }}>
              <SchemaEditor
                errors={errors}
                isLoading={isLoadingFormOrSchema}
                onSchemaChange={handleSchemaChange}
                setErrors={setErrors}
                setValidationOn={setValidationOn}
                stringifiedSchema={stringifiedSchema}
                validationOn={validationOn}
              />
            </div>
            {/* FORM STUDIO: the editable preview */}
            {leftView === 'preview' && (
              <EditablePreview
                schema={schema}
                onSchemaChange={(updated) => updateSchema(updated as unknown as FormSchema)}
              />
            )}
            {/* FORM STUDIO: every rule in plain words */}
            {leftView === 'rules' && (
              <RulesOverview
                schema={schema}
                onSchemaChange={(updated) => updateSchema(updated as unknown as FormSchema)}
              />
            )}
          </div>
        </Column>
        <Column lg={8} md={8} sm={4} className={styles.column}>
          {/* FORM STUDIO: replaces <ActionButtons> (server save and publish) */}
          <FormStudioPanel
            schema={schema}
            original={clobdata}
            form={form}
            onSchemaChange={(updated) => updateSchema(updated as unknown as FormSchema)}
          />
          {validationComplete && (
            <ValidationMessage
              hasValidationErrors={validationResponse.length > 0}
              publishedWithErrors={publishedWithErrors}
              errorsCount={validationResponse.length}
            />
          )}
          {/* FORM STUDIO: a new form ("From scratch") opens on the Interactive Builder tab */}
          <Tabs defaultSelectedIndex={isNewSchema ? 1 : 0}>
            <TabList aria-label="Form previews">
              <Tab>{t('preview', 'Preview')}</Tab>
              <Tab>{t('interactiveBuilder', 'Interactive Builder')}</Tab>
              <Tab>{t('translationBuilder', 'Translation Builder')}</Tab>
              {form && <Tab>{t('auditDetails', 'Audit Details')}</Tab>}
            </TabList>
            <TabPanels>
              <TabPanel>
                <FormRenderer schema={translatedSchema} isLoading={isLoadingFormOrSchema} />
              </TabPanel>
              <TabPanel>
                <InteractiveBuilder
                  schema={schema}
                  onSchemaChange={updateSchema}
                  isLoading={isLoadingFormOrSchema}
                  validationResponse={validationResponse}
                />
              </TabPanel>
              <TabPanel>
                <TranslationBuilder formSchema={schema} onUpdateSchema={updateSchema} />
              </TabPanel>
              <TabPanel>{form && <AuditDetails form={form} key={form.uuid} />}</TabPanel>
            </TabPanels>
          </Tabs>
        </Column>
      </Grid>
    </div>
  );
};

function BackButton({ t }: TranslationFnProps) {
  return (
    <div className={styles.backButton}>
      <ConfigurableLink to={window.getOpenmrsSpaBase() + 'form-studio' /* FORM STUDIO: back to Form Studio */}>
        <Button
          kind="ghost"
          renderIcon={(props) => <ArrowLeft size={24} {...props} />}
          iconDescription={t('returnToDashboard', 'Return to dashboard')}
        >
          <span>{t('backToDashboard', 'Back to dashboard')}</span>
        </Button>
      </ConfigurableLink>
    </div>
  );
}

function FormEditor() {
  const { t } = useTranslation();
  const { formUuid } = useParams<{ formUuid: string }>();
  const isNewForm = !formUuid;

  return (
    <>
      <Header title={isNewForm ? t('createNewForm', 'Create a new form') : t('editForm', 'Edit form')} />
      <BackButton t={t} />
      <FormEditorContent t={t} />
    </>
  );
}

export default FormEditor;
