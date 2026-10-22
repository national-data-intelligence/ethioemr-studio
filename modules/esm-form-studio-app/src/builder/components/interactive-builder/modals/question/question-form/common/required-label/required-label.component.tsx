// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/common/required-label/required-label.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import type { TFunction } from 'i18next';
import styles from './required-label.scss';

interface RequiredLabelProps {
  isRequired: boolean;
  text: string;
  t: TFunction;
}

const RequiredLabel: React.FC<RequiredLabelProps> = ({ isRequired, text, t }) => {
  return (
    <>
      <span>{text}</span>
      {isRequired && (
        <span title={t('required', 'Required')} className={styles.required}>
          *
        </span>
      )}
    </>
  );
};

export default RequiredLabel;
