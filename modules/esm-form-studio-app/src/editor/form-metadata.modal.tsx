/**
 * "From scratch", step 1: the form's metadata, asked as soon as the editor opens. Create fills the
 * standard template (form-model/standard-form-template.json) with these answers. Closing it leaves the editor empty, so
 * a JSON can be pasted instead.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ComboBox,
  Form,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  TextArea,
  TextInput,
} from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { useEncounterTypes, type EncounterType } from '../api/encounter-types.resource';
import { useForms } from '../api/forms.resource';
import { newFormUuid, standardFormSchema, TEMPLATE_VERSION } from '../form-model/standard-template';
import { type FormSchema } from '../form-model/types';

interface FormMetadataModalProps {
  closeModal: () => void;
  onCreate: (schema: FormSchema) => void;
}

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const FormMetadataModal: React.FC<FormMetadataModalProps> = ({ closeModal, onCreate }) => {
  const { t } = useTranslation();
  const { allowedEncounterTypeUuids, descriptionWordRange } = useConfig<Config>();
  const { encounterTypes, isLoading: loadingTypes } = useEncounterTypes();
  const { forms } = useForms({ includeRetired: true });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [encounter, setEncounter] = useState<EncounterType | null>(null);
  const [version, setVersion] = useState(TEMPLATE_VERSION);

  // only the project's encounter types (config); an empty setting means every type on the server
  const allowedTypes = useMemo(
    () =>
      allowedEncounterTypeUuids?.length
        ? encounterTypes.filter((type) => allowedEncounterTypeUuids.includes(type.uuid))
        : encounterTypes,
    [encounterTypes, allowedEncounterTypeUuids],
  );
  const words = countWords(description);
  const { min, max } = descriptionWordRange ?? { min: 18, max: 40 };
  const nameTaken = forms.some((form) => form.name.trim().toLowerCase() === name.trim().toLowerCase());
  const canCreate = Boolean(name.trim() && encounter && !nameTaken);

  const create = () => {
    if (!canCreate) {
      return;
    }
    onCreate(standardFormSchema({ name, description, encounter: encounter.name, version }));
    closeModal();
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('newFormDetails', 'New form: the basics')} />
      <Form onSubmit={(event: React.SyntheticEvent) => (event.preventDefault(), create())}>
        <ModalBody hasScrollingContent>
          <Stack gap={5}>
            <p>
              {t(
                'newFormDetailsExplainer',
                'The form starts from the standard template: Visit Details, then a first "Vital Signs & Assessment" page you can rename or remove. Close this to paste a JSON instead.',
              )}
            </p>
            <TextInput
              id="formStudioFormName"
              labelText={t('formName', 'Form name')}
              placeholder={t('formNamePlaceholder', 'e.g. Cardiac History Sheet')}
              value={name}
              invalid={nameTaken}
              invalidText={t(
                'formNameTaken',
                'A form with this name already exists. Edit that form instead, or choose another name.',
              )}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
            <TextArea
              id="formStudioFormDescription"
              labelText={t('formDescription', 'Description')}
              placeholder={t('formDescriptionPlaceholder', 'What the form records, for whom, and when it is used.')}
              helperText={t('descriptionWords', '{{words}} words (aim for {{min}}-{{max}})', { words, min, max })}
              rows={3}
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            />
            <ComboBox
              id="formStudioEncounterType"
              titleText={t('encounterType', 'Encounter type')}
              placeholder={
                loadingTypes ? `${t('loading', 'Loading')}...` : t('chooseEncounterType', 'Choose an encounter type')
              }
              items={allowedTypes}
              itemToString={(item: EncounterType | null) => item?.name ?? ''}
              selectedItem={encounter}
              onChange={({ selectedItem }: { selectedItem: EncounterType | null }) => setEncounter(selectedItem)}
              helperText={t('projectEncounterTypesOnly', 'Only the project encounter types are offered.')}
            />
            <TextInput
              id="formStudioFormVersion"
              labelText={t('version', 'Version')}
              value={version}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVersion(e.target.value)}
            />
            <TextInput
              id="formStudioFormUuid"
              labelText={t('uuidGenerated', 'UUID (generated from the name)')}
              value={name.trim() ? newFormUuid(name) : ''}
              placeholder={t('uuidAfterName', 'Appears when you type a name')}
              readOnly
            />
            {nameTaken && (
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title={t('sameNameWarning', 'Same name, new uuid')}
                subtitle={t(
                  'sameNameWarningExplainer',
                  'Shipping two forms with one name makes the loader retire the older form.',
                )}
              />
            )}
          </Stack>
        </ModalBody>
      </Form>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('skipPasteJson', 'Skip: I will paste a JSON')}
        </Button>
        <Button disabled={!canCreate} onClick={create}>
          {t('createForm', 'Create form')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default FormMetadataModal;
