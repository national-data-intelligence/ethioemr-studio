// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/editable/editable-value.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@carbon/react';
import { Edit } from '@carbon/react/icons';
import ValueEditor from '../value-editor/value-editor.component';
import styles from './editable-value.scss';

interface EditableValueProps {
  elementType?: 'schema' | 'page' | 'section';
  id: string;
  value: string;
  onSave: (value: string) => void;
}

const EditableValue: React.FC<EditableValueProps> = ({ elementType, id, value, onSave }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  const closeEditor = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <ValueEditor
        handleCancel={closeEditor}
        handleSave={(val) => {
          onSave(val);
          closeEditor();
        }}
        id={id}
        value={value}
      />
    );
  }

  return (
    <>
      <h1 className={styles[`${elementType}` + 'Label']}>{value}</h1>
      <IconButton
        enterDelayMs={300}
        kind="ghost"
        label={t('editButton', 'Edit {{elementType}}', {
          elementType: elementType,
        })}
        onClick={() => setEditing(true)}
        size="md"
      >
        <Edit />
      </IconButton>
    </>
  );
};

export default EditableValue;
