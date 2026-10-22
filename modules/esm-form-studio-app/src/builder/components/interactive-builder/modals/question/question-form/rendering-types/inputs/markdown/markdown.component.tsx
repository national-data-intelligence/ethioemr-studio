// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/rendering-types/inputs/markdown/markdown.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactMde from 'react-mde';
import ReactMarkdown from 'react-markdown';
import { useFormField } from '../../../../form-field-context';
import styles from './markdown.scss';

const MarkdownQuestion: React.FC = () => {
  const { t } = useTranslation();
  const { formField, setFormField } = useFormField();
  const [selectedTab, setSelectedTab] = React.useState<'write' | 'preview'>('write');

  const handleEditorChange = (newValue: string) => {
    const updatedFormField = { ...formField, value: newValue };
    setFormField(updatedFormField);
  };

  const handleTabChange = () => {
    setSelectedTab((prevTab) => (prevTab === 'write' ? 'preview' : 'write'));
  };

  return (
    <div className={styles.container}>
      <ReactMde
        value={formField.value}
        onChange={handleEditorChange}
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        toolbarCommands={[['bold', 'italic']]}
        generateMarkdownPreview={(markdown) =>
          Promise.resolve(<ReactMarkdown children={Array.isArray(markdown) ? markdown.join('\n') : markdown} />)
        }
        childProps={{
          writeButton: {
            tabIndex: -1,
          },
        }}
        loadingPreview={t('loadingPreview', 'Loading preview...')}
      />
    </div>
  );
};

export default MarkdownQuestion;
