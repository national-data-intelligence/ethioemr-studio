/**
 * Form Studio's landing page.
 *   left:  Create a new form, by picking where it starts (from scratch, a Bahmni export, or our Excel template),
 *          and the concept dictionary
 *   right: every form on the server, in the Form Builder's table layout (edit one: its identity stays locked)
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, ClickableTile } from '@carbon/react';
import { Catalog, DataTable as ExcelIcon, DocumentImport, Edit } from '@carbon/react/icons';
import FormsTable from './forms-table.component';
import styles from './start-page.scss';

/** The ways a new form can start. Each opens its own page. */
export const NEW_FORM_STARTS = [
  { id: 'scratch', path: '/new', icon: Edit },
  { id: 'bahmni', path: '/new/bahmni', icon: DocumentImport },
  { id: 'excel', path: '/new/excel', icon: ExcelIcon },
] as const;

export const useStartLabels = () => {
  const { t } = useTranslation();
  return {
    scratch: {
      title: t('fromScratch', 'From scratch'),
      description: t(
        'fromScratchExplainer',
        'Build it section by section and question by question in the interactive builder.',
      ),
    },
    bahmni: {
      title: t('fromBahmniExport', 'From a Bahmni export'),
      description: t('fromBahmniExportExplainer', 'Upload a form exported from Bahmni and convert it.'),
    },
    excel: {
      title: t('fromExcelTemplate', 'From an Excel template'),
      description: t('fromExcelTemplateExplainer', 'Fill in our spreadsheet template, then upload it.'),
    },
  };
};

const StartPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const labels = useStartLabels();

  return (
    <div className={styles.start}>
      <section className={styles.left}>
        <h2 className={styles.heading}>{t('createNewForm', 'Create a new form')}</h2>
        <p className={styles.helper}>{t('chooseStartingPoint', 'Choose a starting point')}</p>
        <div className={styles.cards}>
          {NEW_FORM_STARTS.map(({ id, path, icon: Icon }) => (
            <ClickableTile
              key={id}
              className={styles.card}
              href={`${window.spaBase}/form-studio${path}`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault(); // stay in the app: no full page load
                navigate(path);
              }}
            >
              <div className={styles.cardTitle}>
                <Icon size={20} />
                <span>{labels[id].title}</span>
              </div>
              <p className={styles.helper}>{labels[id].description}</p>
            </ClickableTile>
          ))}
        </div>

        <Button kind="tertiary" size="md" renderIcon={Catalog} onClick={() => navigate('/dictionary')}>
          {t('openConceptDictionary', 'Open the concept dictionary')}
        </Button>
      </section>

      <section className={styles.right}>
        <h2 className={styles.heading}>{t('forms', 'Forms')}</h2>
        <FormsTable />
      </section>
    </div>
  );
};

export default StartPage;
