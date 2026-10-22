// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/new-page/page.modal.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, FormGroup, ModalBody, ModalFooter, ModalHeader, TextInput } from '@carbon/react';
import { showSnackbar } from '@openmrs/esm-framework';
import type { Schema } from '../../../../types';

interface PageModalProps {
  closeModal: () => void;
  schema: Schema;
  onSchemaChange: (schema: Schema) => void;
}

const PageModal: React.FC<PageModalProps> = ({ closeModal, schema, onSchemaChange }) => {
  const { t } = useTranslation();
  const [pageTitle, setPageTitle] = useState('');

  const handleUpdatePageTitle = () => {
    updatePages();
    closeModal();
  };

  const updatePages = () => {
    try {
      if (pageTitle) {
        schema.pages.push({
          label: pageTitle,
          sections: [],
        });

        onSchemaChange({ ...schema });
        setPageTitle('');
      }
      showSnackbar({
        title: t('success', 'Success!'),
        kind: 'success',
        isLowContrast: true,
        subtitle: t('pageCreated', 'New page created'),
      });
    } catch (error) {
      if (error instanceof Error) {
        showSnackbar({
          title: t('errorCreatingPage', 'Error creating page'),
          kind: 'error',
          subtitle: error?.message,
        });
      }
    }
  };

  return (
    <>
      <ModalHeader title={t('createNewPage', 'Create a new page')} closeModal={closeModal} />
      <Form onSubmit={(event: React.SyntheticEvent) => event.preventDefault()}>
        <ModalBody>
          <FormGroup legendText={''}>
            <TextInput
              id="pageTitle"
              labelText={t('enterPageTitle', 'Enter a title for your new page')}
              value={pageTitle}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPageTitle(event.target.value)}
            />
          </FormGroup>
        </ModalBody>
      </Form>
      <ModalFooter>
        <Button onClick={closeModal} kind="secondary">
          {t('cancel', 'Cancel')}
        </Button>
        <Button disabled={!pageTitle} onClick={handleUpdatePageTitle}>
          <span>{t('save', 'Save')}</span>
        </Button>
      </ModalFooter>
    </>
  );
};

export default PageModal;
