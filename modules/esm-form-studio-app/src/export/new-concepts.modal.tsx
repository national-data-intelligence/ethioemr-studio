/**
 * "Create new concepts": every question or answer still unmatched after the dictionary search gets a proposal
 * that a person reviews: name, description and, for measurements, units, range and decimals.
 * A name that already exists on the server is refused (reuse it instead). Groups are not offered:
 * they need an existing set concept.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react';
import { serverConcepts } from '../intake/match-concepts';
import {
  applyNewConcepts,
  loadNewConcepts,
  proposalProblems,
  proposeNewConcepts,
  saveNewConcepts,
  type Proposal,
} from './new-concepts';
import styles from './new-concepts.scss';

interface NewConceptsModalProps {
  closeModal: () => void;
  schema: { uuid?: string; name?: string; pages?: Array<unknown> };
  onSchemaChange: (schema: unknown) => void;
  /** codes the form uses that this EMR doesn't have (not CIEL): created with the same code */
  missing?: Array<string>;
}

const NewConceptsModal: React.FC<NewConceptsModalProps> = ({ closeModal, schema, onSchemaChange, missing }) => {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Array<Proposal>>(() =>
    proposeNewConcepts(schema, undefined, new Set(missing ?? [])),
  );
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);
  const names = useMemo(() => proposals.map((p) => p.concept.name.trim()).join('|'), [proposals]);

  // the collision check: is there already a concept with this exact name on the server?
  useEffect(() => {
    let live = true;
    setChecking(true);
    const source = serverConcepts();
    Promise.all(
      [...new Set(names.split('|').filter(Boolean))].map(async (name) => {
        const found = await source.byName(name);
        const lower = name.toLowerCase();
        return found.some((c) =>
          [c.display, ...(c.names ?? []).map((n) => n.name)].some((n) => n.toLowerCase() === lower),
        )
          ? lower
          : undefined;
      }),
    ).then((hits) => {
      if (live) {
        setExisting(new Set(hits.filter(Boolean)));
        setChecking(false);
      }
    });
    return () => {
      live = false;
    };
  }, [names]);

  const update = (index: number, change: Partial<Proposal['concept']>) =>
    setProposals((all) => all.map((p, i) => (i === index ? { ...p, concept: { ...p.concept, ...change } } : p)));
  const problems = proposals.map((p) => proposalProblems(p, existing));
  const ready = !checking && proposals.length > 0 && problems.every((list) => list.length === 0);

  const create = () => {
    const updated = applyNewConcepts(schema, proposals);
    onSchemaChange(updated);
    const key = schema.uuid || 'new-form';
    saveNewConcepts(key, [...loadNewConcepts(key), ...proposals.map((p) => p.concept)]);
    closeModal();
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('createNewConcepts', 'Create new concepts')} />
      <ModalBody hasScrollingContent>
        <p className={styles.intro}>
          {t(
            'createNewConceptsExplainer',
            'Only for what the dictionary search could not match. Check each name: reuse beats a new concept. The rows are added to master_new_concepts.csv by the export; nothing is created on the server.',
          )}
        </p>
        {proposals.length === 0 && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={t('nothingToCreate', 'Nothing to create')}
            subtitle={t(
              'nothingToCreateExplainer',
              'Groups still unmatched need an existing set concept: pick one with their pencil.',
            )}
          />
        )}
        <div className={styles.list}>
          {proposals.map((p, i) => (
            <Tile key={p.placeholder} className={styles.item}>
              <div className={styles.head}>
                <Tag size="sm" type={p.concept.conceptClass === 'Finding' ? 'teal' : 'blue'}>
                  {p.concept.conceptClass} · {p.concept.datatype}
                </Tag>
                {p.missingOnServer && (
                  <Tag size="sm" type="warm-gray" title={p.concept.uuid}>
                    {t('missingKeepsCode', 'Missing on this EMR: keeps its code')}
                  </Tag>
                )}
                <span className={styles.where}>{p.concept.usedBy}</span>
              </div>
              <TextInput
                id={`name-${i}`}
                labelText={t('conceptNameLabel', 'Name')}
                value={p.concept.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { name: e.target.value })}
              />
              <TextInput
                id={`description-${i}`}
                labelText={t('formDescription', 'Description')}
                value={p.concept.description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { description: e.target.value })}
              />
              {p.concept.datatype === 'Numeric' && (
                <div className={styles.numeric}>
                  <TextInput
                    id={`units-${i}`}
                    labelText={t('units', 'Units')}
                    value={p.concept.units ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { units: e.target.value })}
                  />
                  <TextInput
                    id={`low-${i}`}
                    labelText={t('absoluteLow', 'Lowest possible')}
                    value={p.concept.absoluteLow ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { absoluteLow: e.target.value })}
                  />
                  <TextInput
                    id={`high-${i}`}
                    labelText={t('absoluteHigh', 'Highest possible')}
                    value={p.concept.absoluteHigh ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { absoluteHigh: e.target.value })}
                  />
                  <Checkbox
                    id={`decimal-${i}`}
                    labelText={t('allowDecimals', 'Decimals allowed')}
                    checked={Boolean(p.concept.allowDecimal)}
                    onChange={(_e: unknown, { checked }: { checked: boolean }) => update(i, { allowDecimal: checked })}
                  />
                </div>
              )}
              {problems[i].map((problem) => (
                <p key={problem} className={styles.problem}>
                  {problem}
                </p>
              ))}
            </Tile>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button disabled={!ready} onClick={create}>
          {checking
            ? t('checkingNames', 'Checking names…')
            : t('createConceptsCount', 'Create {{count}} concepts', { count: proposals.length })}
        </Button>
      </ModalFooter>
    </>
  );
};

export default NewConceptsModal;
