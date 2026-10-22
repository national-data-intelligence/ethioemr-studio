import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentAdd } from '@carbon/react/icons';
import { navigate } from '@openmrs/esm-framework';
import styles from './form-studio-nav-tile.scss';

interface FormStudioNavTileProps {
  /** Passed in by the menu (KenyaEMR's navbar overlay) as extension state; closes the menu. */
  hideOverlay?: (hide: boolean) => void;
}

/**
 * Form Studio's tile in the top-right grid menu (slot `navbar-items-slot`), where Legacy Admin, ETL
 * Administration and the other admin tools sit. Same markup and styles as the team's tiles
 * (@palladium-ethiopia/esm-orders-admin-app, components/nav-tile-link).
 */
const FormStudioNavTile: React.FC<FormStudioNavTileProps> = ({ hideOverlay }) => {
  const { t } = useTranslation();

  const handleClick = () => {
    hideOverlay?.(false);
    navigate({ to: `${window.spaBase}/form-studio` });
  };

  return (
    <button type="button" onClick={handleClick} className={styles.navLinkItem}>
      <DocumentAdd size={24} />
      <span>{t('formStudio', 'Form Studio')}</span>
    </button>
  );
};

export default FormStudioNavTile;
