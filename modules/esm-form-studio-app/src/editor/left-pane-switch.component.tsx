/** The switch above the editor's left pane: the editable preview, the form's rules in words, or the JSON. */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ContentSwitcher, Switch } from '@carbon/react';

export type LeftView = 'preview' | 'rules' | 'schema';
const VIEWS: Array<LeftView> = ['preview', 'rules', 'schema'];

const LeftPaneSwitch: React.FC<{ value: LeftView; onChange: (view: LeftView) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <ContentSwitcher
      size="sm"
      selectedIndex={VIEWS.indexOf(value)}
      onChange={({ name }: { name?: string | number }) => onChange(name as LeftView)}
      style={{ maxWidth: '24rem' }}
    >
      <Switch name="preview" text={t('previewAndEdit', 'Preview & edit')} />
      <Switch name="rules" text={t('rules', 'Rules')} />
      <Switch name="schema" text={t('schemaEditor', 'Schema editor')} />
    </ContentSwitcher>
  );
};

export default LeftPaneSwitch;
