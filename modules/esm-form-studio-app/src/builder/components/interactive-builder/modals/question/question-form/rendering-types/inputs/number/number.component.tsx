// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/rendering-types/inputs/number/number.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@carbon/react';
import { useFormField } from '../../../../form-field-context';

const Number: React.FC = () => {
  const { t } = useTranslation();
  const { formField, setFormField } = useFormField();

  return (
    <>
      <TextInput
        id="min"
        labelText={t('minValue', 'Min value that can be entered')}
        value={formField.questionOptions?.min ?? ''}
        invalid={parseFloat(formField.questionOptions?.min ?? '') > parseFloat(formField.questionOptions?.max ?? '')}
        invalidText={
          parseFloat(formField.questionOptions?.min ?? '') > parseFloat(formField.questionOptions?.max ?? '')
            ? t('invalidMinMax', 'Min value cannot be greater than max')
            : ''
        }
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const updatedQuestion = {
            ...formField,
            questionOptions: { ...formField.questionOptions, min: event.target.value },
          };
          setFormField(updatedQuestion);
        }}
      />
      <TextInput
        id="max"
        labelText={t('maxValue', 'Max value that can be entered')}
        value={formField.questionOptions?.max ?? ''}
        invalid={parseFloat(formField.questionOptions?.min ?? '') > parseFloat(formField.questionOptions?.max ?? '')}
        invalidText={
          parseFloat(formField.questionOptions?.min ?? '') > parseFloat(formField.questionOptions?.max ?? '')
            ? t('invalidMinMax', 'Min value cannot be greater than max')
            : ''
        }
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const updatedQuestion = {
            ...formField,
            questionOptions: { ...formField.questionOptions, max: event.target.value },
          };
          setFormField(updatedQuestion);
        }}
      />
    </>
  );
};

export default Number;
