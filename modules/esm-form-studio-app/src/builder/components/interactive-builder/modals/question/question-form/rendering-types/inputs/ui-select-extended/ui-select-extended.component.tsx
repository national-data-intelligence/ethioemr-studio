// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/rendering-types/inputs/ui-select-extended/ui-select-extended.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { RadioButtonGroup, RadioButton } from '@carbon/react';
import { useFormField } from '../../../../form-field-context';

const UiSelectExtended: React.FC = () => {
  const { t } = useTranslation();
  const { formField, setFormField } = useFormField();

  return (
    <>
      <RadioButtonGroup
        defaultSelected="notSearchable"
        name="isUiSelectSearchable"
        legendText={t('isUiSelectSearchable', 'Is the ui-select-extended rendering searchable')}
      >
        <RadioButton
          id="uiSelectNotSearchable"
          checked={!formField.questionOptions?.isSearchable}
          labelText={t('notSearchable', 'Not Searchable')}
          onClick={() => {
            const updatedQuestion = {
              ...formField,
              questionOptions: { ...formField.questionOptions, isSearchable: false },
            };
            setFormField(updatedQuestion);
          }}
          value="notSearchable"
        />
        <RadioButton
          id="uiSelectSearchable"
          checked={formField.questionOptions?.isSearchable}
          labelText={t('searchable', 'Searchable')}
          onClick={() => {
            const updatedQuestion = {
              ...formField,
              questionOptions: { ...formField.questionOptions, isSearchable: true },
            };
            setFormField(updatedQuestion);
          }}
          value="searchable"
        />
      </RadioButtonGroup>
    </>
  );
};

export default UiSelectExtended;
