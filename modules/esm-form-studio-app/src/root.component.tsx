/**
 * The Form Studio page. Everything below /openmrs/spa/form-studio is routed here:
 *   /             start: create a new form or pick one to edit
 *   /new          the editor (the Form Builder's editor page + Form Studio's panel), new form from scratch
 *   /new/bahmni   new form from a Bahmni export: upload, convert, review, then the editor
 *   /new/excel    new form from the Excel template: same steps
 *   /edit/:uuid   the editor for an existing form, with its identity locked
 *   /dictionary   the concept dictionary
 */
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { InlineNotification } from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from './config-schema';
import StartPage from './start/start-page.component';
import IntakePage from './intake/intake-page.component';
import ConceptDictionary from './dictionary/concept-dictionary.component';
import FormEditor from './builder/components/form-editor/form-editor.component';
import styles from './root.scss';

/** Title and test-instance banner for Form Studio's own pages (the editor brings the Form Builder's header). */
const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { showTestInstanceBanner } = useConfig<Config>();
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>{t('formStudio', 'Form Studio')}</h1>
      {showTestInstanceBanner && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={t('testInstancesOnly', 'For test instances only.')}
          subtitle={t(
            'testInstancesOnlyExplainer',
            'Forms reach facilities only through the content repository. Export from here, never edit a live server.',
          )}
        />
      )}
      {children}
    </main>
  );
};

const Root: React.FC = () => (
  <BrowserRouter basename={`${window.spaBase}/form-studio`}>
    <Routes>
      <Route
        path="/"
        element={
          <PageShell>
            <StartPage />
          </PageShell>
        }
      />
      <Route path="/new" element={<FormEditor />} />
      <Route
        path="/new/bahmni"
        element={
          <PageShell>
            <IntakePage source="bahmni" />
          </PageShell>
        }
      />
      <Route
        path="/new/excel"
        element={
          <PageShell>
            <IntakePage source="excel" />
          </PageShell>
        }
      />
      <Route path="/edit/:formUuid" element={<FormEditor />} />
      <Route
        path="/dictionary"
        element={
          <PageShell>
            <ConceptDictionary />
          </PageShell>
        }
      />
    </Routes>
  </BrowserRouter>
);

export default Root;
