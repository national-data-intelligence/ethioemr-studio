/** The expanded row of the Concept dictionary: everything about one concept, fetched when opened. */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { InlineLoading, Tag } from '@carbon/react';
import { useConceptDetails } from '../api/concept-index.resource';
import styles from './concept-dictionary.scss';

interface ConceptDetailsProps {
  uuid: string;
  usedIn: Array<string>;
}

const List: React.FC<{ items: Array<string>; empty: string }> = ({ items, empty }) =>
  items.length ? (
    <ul className={styles.detailList}>
      {items.map((item, i) => (
        <li key={item + i}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className={styles.muted}>{empty}</p>
  );

const ConceptDetails: React.FC<ConceptDetailsProps> = ({ uuid, usedIn }) => {
  const { t } = useTranslation();
  const { concept, error, isLoading } = useConceptDetails(uuid);

  if (isLoading) {
    return <InlineLoading description={`${t('loading', 'Loading')}...`} />;
  }
  if (error || !concept) {
    return <p className={styles.muted}>{t('couldNotLoadConcept', 'Could not load this concept.')}</p>;
  }

  const description =
    concept.descriptions?.find((d) => d.locale === 'en')?.description ?? concept.descriptions?.[0]?.description;
  const numeric = concept.datatype?.display === 'Numeric';
  const range = (low?: number, high?: number) =>
    low == null && high == null ? '-' : `${low ?? '...'} to ${high ?? '...'}`;

  return (
    <div className={styles.details}>
      <section>
        <h4>{t('overview', 'Overview')}</h4>
        <p>{description || <span className={styles.muted}>{t('noDescription', 'No description')}</span>}</p>
        <p className={styles.muted}>{concept.uuid}</p>
        <div className={styles.tags}>
          {concept.set && <Tag type="purple">{t('set', 'Set')}</Tag>}
          {concept.retired && <Tag type="red">{t('retired', 'Retired')}</Tag>}
        </div>
        {numeric && (
          <dl className={styles.numeric}>
            <dt>{t('units', 'Units')}</dt>
            <dd>{concept.units || '-'}</dd>
            <dt>{t('decimals', 'Decimals')}</dt>
            <dd>{concept.allowDecimal ? t('allowed', 'Allowed') : t('wholeNumbersOnly', 'Whole numbers only')}</dd>
            <dt>{t('normalRange', 'Normal')}</dt>
            <dd>{range(concept.lowNormal, concept.hiNormal)}</dd>
            <dt>{t('absoluteRange', 'Absolute')}</dt>
            <dd>{range(concept.lowAbsolute, concept.hiAbsolute)}</dd>
          </dl>
        )}
      </section>
      <section>
        <h4>{t('namesAndSynonyms', 'Names and synonyms')}</h4>
        <List
          items={(concept.names ?? []).map(
            (n) =>
              `${n.display} (${n.locale}${n.conceptNameType === 'FULLY_SPECIFIED' ? ', fully specified' : n.conceptNameType === 'SHORT' ? ', short' : ''})`,
          )}
          empty="-"
        />
      </section>
      <section>
        <h4>{concept.set ? t('setMembers', 'Set members') : t('answers', 'Answers')}</h4>
        <List
          items={(concept.set ? concept.setMembers : (concept.answers ?? [])).map((a) => a.display)}
          empty={concept.set ? t('noMembers', 'No members') : t('noAnswers', 'No answers')}
        />
      </section>
      <section>
        <h4>{t('mappings', 'Mappings')}</h4>
        <List items={(concept.mappings ?? []).map((m) => m.display)} empty={t('noMappings', 'No mappings')} />
      </section>
      <section>
        <h4>{t('usedInForms', 'Used in forms')}</h4>
        <List items={usedIn} empty={t('notUsedInForms', 'Not used in any form')} />
      </section>
    </div>
  );
};

export default ConceptDetails;
