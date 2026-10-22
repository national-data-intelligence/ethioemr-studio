// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/validation-info/validation-info.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { InlineNotification } from '@carbon/react';
import { useTranslation } from 'react-i18next';

interface ValidationMessageProps {
  hasValidationErrors: boolean;
  publishedWithErrors: boolean;
  errorsCount: number;
}

const ValidationMessage: React.FC<ValidationMessageProps> = ({
  hasValidationErrors,
  publishedWithErrors,
  errorsCount,
}) => {
  const { t } = useTranslation();
  return publishedWithErrors ? (
    <InlineNotification
      kind="error"
      title={t('publishingFailed', 'Publishing failed')}
      lowContrast={true}
      subtitle={t('publishWarning', 'Cannot publish form with validation errors')}
    />
  ) : hasValidationErrors ? (
    <InlineNotification
      kind="error"
      title={t('validationErrors', 'Validation found {{count}} errors', { count: errorsCount })}
      lowContrast={true}
      subtitle={t('viewErrors', 'View the errors in the interactive builder')}
    />
  ) : (
    <InlineNotification
      kind="success"
      title={t('ValidationSuccessful', 'Validation Successful')}
      lowContrast={true}
      subtitle={t('noValidationErrorsFound', 'No validation errors found')}
    />
  );
};

export default ValidationMessage;
