import React from 'react';
import { useTranslation } from 'react-i18next';
import { Catalog } from '@carbon/react/icons';
import { navigate } from '@openmrs/esm-framework';
import styles from './form-studio-nav-tile.scss';

/** "Concept Dictionary" tile in the top-right grid menu, next to Form Studio (same markup as the team's tiles). */
const ConceptDictionaryNavTile: React.FC<{ hideOverlay?: (hide: boolean) => void }> = ({ hideOverlay }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.navLinkItem}
      onClick={() => {
        hideOverlay?.(false);
        navigate({ to: `${window.spaBase}/form-studio/dictionary` });
      }}
    >
      <Catalog size={24} />
      <span>{t('conceptDictionary', 'Concept dictionary')}</span>
    </button>
  );
};

export default ConceptDictionaryNavTile;
