// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/common/concept-search/concept-search.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React, { useState, useCallback, useEffect } from 'react';
import { Search, InlineLoading, Layer, Tile, FormLabel, InlineNotification } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from '@carbon/react/icons';
import { useConceptId } from '../../../../../../../hooks/useConceptId';
// FORM STUDIO: ranked, rule-checked concept search
import { useConceptSearch as useConceptLookup } from '../../../../../../../../concepts/use-concept-search';
import ConceptResults from '../../../../../../../../concepts/concept-results.component';
import { useDebounce } from '@openmrs/esm-framework';
import type { Concept } from '../../../../../../../types';
import styles from './concept-search.scss';
import { useFormField } from '../../../form-field-context';

interface ConceptSearchProps {
  label?: string;
  defaultConcept?: string;
  onClearSelectedConcept?: () => void;
  onSelectConcept: (concept: Concept) => void;
  retainConceptInContextAfterSearch?: boolean;
  clearSearchAfterSelection?: boolean;
}

const ConceptSearch: React.FC<ConceptSearchProps> = ({
  label,
  defaultConcept,
  onClearSelectedConcept,
  onSelectConcept,
  retainConceptInContextAfterSearch = false,
  clearSearchAfterSelection = false,
}) => {
  const { t } = useTranslation();
  const [conceptToLookup, setConceptToLookup] = useState('');
  const debouncedConceptToLookup = useDebounce(conceptToLookup);
  const { concepts, conceptLookupError, isLoadingConcepts } = useConceptLookup(debouncedConceptToLookup);
  const {
    concept: initialConcept,
    conceptName,
    conceptNameLookupError,
    isLoadingConcept,
  } = useConceptId(defaultConcept);
  const [selectedConcept, setSelectedConcept] = useState<Concept>(initialConcept);
  const { concept, setConcept, setIsConceptValid, formField } = useFormField(); // FORM STUDIO: + formField

  useEffect(() => {
    if (retainConceptInContextAfterSearch && initialConcept && !concept) {
      setConcept(initialConcept);
    }
  }, [initialConcept, retainConceptInContextAfterSearch, concept, setConcept]);

  const handleConceptChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setConceptToLookup(event.target.value),
    [],
  );

  useEffect(() => {
    if (conceptLookupError || conceptNameLookupError) {
      setIsConceptValid(false);
    }
  }, [conceptLookupError, conceptNameLookupError, setIsConceptValid]);

  const clearSelectedConcept = useCallback(() => {
    setSelectedConcept(null);
    setConceptToLookup('');
    setIsConceptValid(true);
    if (onClearSelectedConcept) onClearSelectedConcept();
  }, [onClearSelectedConcept, setIsConceptValid]);

  const handleConceptSelect = useCallback(
    (concept: Concept) => {
      setConceptToLookup('');
      setSelectedConcept(concept);
      onSelectConcept(concept);
      setIsConceptValid(true);

      if (clearSearchAfterSelection) {
        clearSelectedConcept();
      }
    },
    [onSelectConcept, setIsConceptValid, clearSelectedConcept, clearSearchAfterSelection],
  );
  return (
    <>
      <FormLabel className={styles.label}>
        {label ?? t('searchForBackingConcept', 'Search for a backing concept')}
      </FormLabel>
      {(conceptLookupError || conceptNameLookupError) && (
        <InlineNotification
          kind="error"
          lowContrast
          className={styles.error}
          title={
            conceptLookupError
              ? t('errorFetchingConcepts', 'Error fetching concepts')
              : t('errorFetchingConceptName', "Couldn't resolve concept name")
          }
          subtitle={
            conceptLookupError
              ? t('pleaseTryAgain', 'Please try again.')
              : t('conceptDoesNotExist', `The linked concept '{{conceptName}}' does not exist in your dictionary`, {
                  conceptName: defaultConcept,
                })
          }
        />
      )}
      <div className={styles.searchContainer}>
        {isLoadingConcept ? (
          <InlineLoading className={styles.loader} description={t('loading', 'Loading') + '...'} />
        ) : (
          <Search
            id="conceptLookup"
            onClear={clearSelectedConcept}
            onChange={handleConceptChange}
            labelText={t('searchForBackingConcept', 'Search for a backing concept')}
            placeholder={t('searchConcept', 'Search using a concept name or UUID')}
            size="md"
            value={(() => {
              if (conceptToLookup) {
                return conceptToLookup;
              }
              if (selectedConcept) {
                return selectedConcept.display;
              }
              if (conceptName) {
                return conceptName;
              }
              return '';
            })()}
          />
        )}
        {(() => {
          if (!conceptToLookup) return null;
          if (isLoadingConcepts)
            return <InlineLoading className={styles.loader} description={t('searching', 'Searching') + '...'} />;
          if (concepts?.length && !isLoadingConcepts) {
            return (
              /* FORM STUDIO: ranked and judged for the role (question, group or answer) */
              <ConceptResults
                concepts={concepts}
                query={debouncedConceptToLookup}
                role={clearSearchAfterSelection ? 'answer' : formField?.type === 'obsGroup' ? 'group' : 'question'}
                rendering={formField?.questionOptions?.rendering}
                onSelect={(selected) => handleConceptSelect(selected as unknown as Concept)}
              />
            );
          }
          return (
            <div className={styles.dropdownContainer}>
              <Layer>
                <Tile className={styles.emptyResults}>
                  <span>
                    {t('noMatchingConcepts', 'No concepts were found that match')}{' '}
                    <strong>"{debouncedConceptToLookup}".</strong>
                  </span>
                </Tile>
                <div className={styles.oclLauncherBanner}>
                  <p className={styles.bodyShort01}>{t('conceptSearchHelpText', "Can't find a concept?")}</p>
                  <a
                    className={styles.oclLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={'https://app.openconceptlab.org/'}
                  >
                    {t('searchInOCL', 'Search in OCL')}
                    <ArrowUpRight size={16} />
                  </a>
                </div>
              </Layer>
            </div>
          );
        })()}
      </div>
    </>
  );
};

export default ConceptSearch;
