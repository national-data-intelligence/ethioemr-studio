// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/unpublish-form/unpublish-form.modal.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalHeader, ModalFooter } from '@carbon/react';

interface UnpublishModalProps {
  closeModal: () => void;
  onUnpublishForm: () => void;
}

const UnpublishFormModal: React.FC<UnpublishModalProps> = ({ closeModal, onUnpublishForm }) => {
  const { t } = useTranslation();

  return (
    <>
      <ModalHeader
        closeModal={closeModal}
        title={t('unpublishConfirmation', 'Are you sure you want to unpublish this form?')}
      />
      <ModalBody>
        <p>
          {t(
            'unpublishExplainerText',
            'Unpublishing a form means you can no longer access it from your frontend. Unpublishing forms does not delete their associated schemas, it only affects whether or not you can access them in your frontend.',
          )}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          kind="danger"
          onClick={() => {
            onUnpublishForm();
            closeModal();
          }}
        >
          <span>{t('unpublish', 'Unpublish')}</span>
        </Button>
      </ModalFooter>
    </>
  );
};

export default UnpublishFormModal;
