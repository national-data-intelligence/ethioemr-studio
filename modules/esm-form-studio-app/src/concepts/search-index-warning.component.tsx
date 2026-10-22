/**
 * A plain warning when this server's concept search index is out of date (src/api/search-index-health.ts), shown
 * on the concept dictionary and in the question dialog's concept search. Without it, a form builder sees a
 * short result list, concludes the concept doesn't exist, and creates a duplicate.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { InlineNotification } from '@carbon/react';
import { useSearchIndexHealth } from '../api/search-index-health';

const SearchIndexWarning: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { t } = useTranslation();
  const health = useSearchIndexHealth();
  if (!health?.stale) return null;
  return (
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={t('searchIndexStale', "This EMR's concept search is incomplete")}
      subtitle={
        compact
          ? t(
              'searchIndexStaleShort',
              "Search finds only some of this server's concepts, so a missing result doesn't mean the concept doesn't exist. Ask an administrator to rebuild the search index.",
            )
          : t(
              'searchIndexStaleLong',
              "Search finds only some of the concepts on this server: of {{sampled}} concepts taken from this server's own list, search found {{found}} by their own name. Many concepts, often all the CIEL ones, will be missing from the results, so don't create a new concept just because search didn't find it. Ask a system administrator to rebuild the search index (Legacy Admin > Maintenance > Search Index > Rebuild).",
              { found: health.found, sampled: health.sampled },
            )
      }
    />
  );
};

export default SearchIndexWarning;
