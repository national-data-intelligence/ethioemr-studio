/**
 * Rename a page from the editable preview. The Interactive Builder renames pages inline and has no dialog for it,
 * so this is Form Studio's own. Same contract as the builder's dialogs: schema, onSchemaChange, index.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, ModalBody, ModalFooter, ModalHeader, TextInput } from '@carbon/react';
import { type PreviewSchema } from './editable-preview/editable-preview.component';

interface PageLabelModalProps {
  closeModal: () => void;
  schema: PreviewSchema;
  onSchemaChange: (schema: PreviewSchema) => void;
  pageIndex: number;
}

const PageLabelModal: React.FC<PageLabelModalProps> = ({ closeModal, schema, onSchemaChange, pageIndex }) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState(schema.pages?.[pageIndex]?.label ?? '');

  const save = () => {
    if (!label.trim()) {
      return;
    }
    const pages = schema.pages.map((page, i) => (i === pageIndex ? { ...page, label: label.trim() } : page));
    onSchemaChange({ ...schema, pages });
    closeModal();
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('editPage', 'Edit page')} />
      <Form onSubmit={(event: React.SyntheticEvent) => (event.preventDefault(), save())}>
        <ModalBody>
          <TextInput
            id="formStudioPageLabel"
            labelText={t('pageName', 'Page name')}
            value={label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
          />
        </ModalBody>
      </Form>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button disabled={!label.trim()} onClick={save}>
          {t('save', 'Save')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default PageLabelModal;
