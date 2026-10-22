/**
 * The ranked result list in the question dialog's concept search: each concept with its class and
 * datatype, how many shipped forms use it, and why it is flagged or refused. Refused ones can't be picked.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { useFormUsage } from '../api/form-usage.resource';
import { type ConceptRole, rankConcepts, type SearchConcept } from './concept-rules';
import SearchIndexWarning from './search-index-warning.component';
import styles from './concept-results.scss';

interface ConceptResultsProps {
  concepts: Array<SearchConcept>;
  query: string;
  role: ConceptRole;
  rendering?: string;
  onSelect: (concept: SearchConcept) => void;
}

const ConceptResults: React.FC<ConceptResultsProps> = ({ concepts, query, role, rendering, onSelect }) => {
  const { t } = useTranslation();
  const { blockedQuestionConceptClasses } = useConfig<Config>();
  const { usage } = useFormUsage();
  const ranked = useMemo(
    () => rankConcepts(concepts, query, role, { rendering, blockedClasses: blockedQuestionConceptClasses, usage }),
    [concepts, query, role, rendering, blockedQuestionConceptClasses, usage],
  );

  return (
    <>
      <SearchIndexWarning compact />
      <ul className={styles.list} data-testid="ranked-concepts">
        {ranked.map(({ concept, verdict, reasons, usedIn }) => {
          const blocked = verdict === 'blocked';
          return (
            <li
              key={concept.uuid}
              role="menuitem"
              aria-disabled={blocked}
              className={blocked ? styles.blocked : styles.item}
              onClick={() => !blocked && onSelect(concept)}
            >
              <span className={styles.name}>{concept.display}</span>
              <span className={styles.meta}>
                {[concept.conceptClass?.display, concept.datatype?.display].filter(Boolean).join(' · ')}
              </span>
              {usedIn > 0 && (
                <Tag size="sm" type="blue">
                  {t('usedInFormsCount', 'used in {{count}} forms', { count: usedIn })}
                </Tag>
              )}
              {reasons.map((reason) => (
                <Tag key={reason} size="sm" type={blocked ? 'red' : 'warm-gray'}>
                  {reason}
                </Tag>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default ConceptResults;
