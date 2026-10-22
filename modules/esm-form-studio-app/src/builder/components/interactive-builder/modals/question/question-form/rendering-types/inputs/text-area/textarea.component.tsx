// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/rendering-types/inputs/text-area/textarea.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@carbon/react';
import { useFormField } from '../../../../form-field-context';

const TextArea: React.FC = () => {
  const { t } = useTranslation();
  const { formField, setFormField } = useFormField();

  return (
    <TextInput
      id="textAreaRows"
      labelText={t('rows', 'Rows')}
      value={formField.questionOptions?.rows ? formField.questionOptions.rows.toString() : ''}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        const updatedQuestion = {
          ...formField,
          questionOptions: { ...formField.questionOptions, rows: parseInt(event.target.value) },
        };
        setFormField(updatedQuestion);
      }}
    />
  );
};

export default TextArea;
