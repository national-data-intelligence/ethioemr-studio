/**
 * The rules of one question, in plain words. Written for the people who use Form Studio: nurses,
 * doctors and data officers, not programmers. Four parts, each with a one-line explanation:
 * When should this question appear?, Warn if the value is unusual, Number format, Fill in by itself.
 * Rules Form Studio can't read ("written by hand") are shown, kept exactly, and only replaced on request.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  Stack,
  TextInput,
} from '@carbon/react';
import { Add, TrashCan } from '@carbon/react/icons';
import { labelsFor, readRules, type RuleEdits, type RuleQuestion, writeRules } from './question-rules';
import { type CalcRule, type Condition, describeShow, type ShowRule } from './rules';
import styles from './question-rules.scss';
import { plainText } from '../plain-text';

interface Schema {
  pages?: Array<{ label?: string; sections?: Array<{ label?: string; questions?: Array<RuleQuestion> }> }>;
}
interface QuestionRulesModalProps {
  closeModal: () => void;
  schema: Schema;
  onSchemaChange: (schema: Schema) => void;
  pageIndex: number;
  sectionIndex: number;
  questionIndex: number;
  subQuestionIndex?: number;
}

const CODED = ['radio', 'select', 'checkbox', 'content-switcher', 'toggle', 'ui-select-extended'];
const COMPARE = [
  { op: '<', words: 'is under' },
  { op: '<=', words: 'is at most' },
  { op: '>', words: 'is over' },
  { op: '>=', words: 'is at least' },
] as const;
type Kind = 'choice' | 'number' | 'other';
const kindOf = (q?: RuleQuestion): Kind =>
  CODED.includes(q?.questionOptions?.rendering ?? '') && q?.questionOptions?.answers?.length
    ? 'choice'
    : q?.questionOptions?.rendering === 'number'
      ? 'number'
      : 'other';

const QuestionRulesModal: React.FC<QuestionRulesModalProps> = (props) => {
  const { closeModal, schema, onSchemaChange, pageIndex, sectionIndex, questionIndex, subQuestionIndex } = props;
  const { t } = useTranslation();
  const parent = schema.pages[pageIndex].sections[sectionIndex].questions[questionIndex];
  const question =
    subQuestionIndex !== undefined && subQuestionIndex !== null ? parent.questions[subQuestionIndex] : parent;
  const rules = useMemo(() => readRules(question), [question]);
  const labels = useMemo(() => labelsFor(schema), [schema]);

  // every other question in the form, for "based on"
  const others = useMemo(() => {
    const list: Array<RuleQuestion> = [];
    const visit = (q: RuleQuestion) => {
      if (q.id && q.id !== question.id && q.type !== 'markdown' && q.type !== 'obsGroup') list.push(q);
      q.questions?.forEach(visit);
    };
    schema.pages?.forEach((p) => p.sections?.forEach((s) => s.questions?.forEach(visit)));
    return list;
  }, [schema, question.id]);
  const byId = useMemo(() => new Map(others.map((q) => [q.id, q])), [others]);

  // state: only parts a person touches are written back
  const [edits, setEdits] = useState<RuleEdits>({});
  const showCustom = rules.show && 'custom' in rules.show ? rules.show.custom : undefined;
  const [show, setShow] = useState<ShowRule | null>(rules.show && 'rule' in rules.show ? rules.show.rule : null);
  const [replaceCustom, setReplaceCustom] = useState(false);
  const warnRule = rules.warn && 'rule' in rules.warn ? rules.warn.rule : undefined;
  const [below, setBelow] = useState(warnRule?.below?.toString() ?? '');
  const [above, setAbove] = useState(warnRule?.above?.toString() ?? '');
  const [decimals, setDecimals] = useState(rules.decimals === undefined ? 'any' : String(rules.decimals));
  const calcCustom = rules.calc && 'custom' in rules.calc ? rules.calc.custom : undefined;
  const [calc, setCalc] = useState<CalcRule | null>(rules.calc && 'rule' in rules.calc ? rules.calc.rule : null);

  const isNumber = question.questionOptions?.rendering === 'number';
  const numbers = others.filter((q) => kindOf(q) === 'number');
  const dates = others.filter((q) => ['date', 'datetime'].includes(q.questionOptions?.rendering ?? ''));

  const updateShow = (next: ShowRule | null) => {
    setShow(next);
    setEdits((e) => ({ ...e, show: next }));
  };
  const setCondition = (i: number, c: Condition) =>
    updateShow({ join: show?.join ?? 'all', conditions: show.conditions.map((old, j) => (j === i ? c : old)) });
  const newCondition = (): Condition => {
    const first = others.find((q) => kindOf(q) === 'choice') ?? others[0];
    return kindOf(first) === 'choice'
      ? { kind: 'answer', question: first.id, op: 'is', values: [first.questionOptions.answers[0].concept] }
      : { kind: 'answered', question: first?.id ?? '', answered: true };
  };

  const save = () => {
    const finalEdits: RuleEdits = { ...edits };
    if (below !== (warnRule?.below?.toString() ?? '') || above !== (warnRule?.above?.toString() ?? '')) {
      finalEdits.warn =
        below === '' && above === ''
          ? null
          : { below: below === '' ? undefined : Number(below), above: above === '' ? undefined : Number(above) };
    }
    if (decimals !== (rules.decimals === undefined ? 'any' : String(rules.decimals))) {
      finalEdits.decimals = decimals === 'any' ? null : Number(decimals);
    }
    const updated = writeRules(question, finalEdits);
    const next = structuredClone(schema);
    const target = next.pages[pageIndex].sections[sectionIndex].questions;
    if (subQuestionIndex !== undefined && subQuestionIndex !== null)
      target[questionIndex].questions[subQuestionIndex] = updated;
    else target[questionIndex] = updated;
    onSchemaChange(next);
    closeModal();
  };

  const conditionRow = (c: Condition, i: number) => {
    const sourceValue = c.kind === 'age' ? '__age' : c.kind === 'sex' ? '__sex' : c.question;
    const source = byId.get(sourceValue);
    const kind = kindOf(source);
    const changeSource = (value: string) => {
      if (value === '__age') return setCondition(i, { kind: 'age', op: '<', value: 5, emptyHides: true });
      if (value === '__sex') return setCondition(i, { kind: 'sex', value: 'F' });
      const q = byId.get(value);
      setCondition(
        i,
        kindOf(q) === 'choice'
          ? { kind: 'answer', question: value, op: 'is', values: [q.questionOptions.answers[0].concept] }
          : kindOf(q) === 'number'
            ? { kind: 'number', question: value, op: '>', value: 0, emptyHides: true }
            : { kind: 'answered', question: value, answered: true },
      );
    };
    const comparisons =
      c.kind === 'age'
        ? COMPARE.map((x) => ({ value: x.op, text: x.words }))
        : c.kind === 'sex'
          ? []
          : [
              ...(kind === 'choice'
                ? [
                    { value: 'is', text: 'is' },
                    { value: 'is not', text: 'is not' },
                  ]
                : []),
              ...(kind === 'choice' && source.questionOptions.rendering === 'checkbox'
                ? [{ value: 'includes', text: 'includes' }]
                : []),
              ...(kind === 'number' ? COMPARE.map((x) => ({ value: x.op, text: x.words })) : []),
              { value: 'answered', text: 'has an answer' },
              { value: 'empty', text: 'is empty' },
            ];
    const comparison =
      c.kind === 'answered'
        ? c.answered
          ? 'answered'
          : 'empty'
        : c.kind === 'answer'
          ? c.op
          : c.kind === 'sex'
            ? ''
            : c.op;
    const changeComparison = (value: string) => {
      if (value === 'answered' || value === 'empty')
        return setCondition(i, { kind: 'answered', question: sourceValue, answered: value === 'answered' });
      if (c.kind === 'age') return setCondition(i, { ...c, op: value as typeof c.op });
      if (kind === 'number')
        return setCondition(i, {
          kind: 'number',
          question: sourceValue,
          op: value as '<',
          value: c.kind === 'number' ? c.value : 0,
          emptyHides: true,
        });
      return setCondition(i, {
        kind: 'answer',
        question: sourceValue,
        op: value as 'is',
        values: c.kind === 'answer' ? c.values : [source.questionOptions.answers[0].concept],
        emptyHides: c.kind === 'answer' ? c.emptyHides : true,
      });
    };
    return (
      <div key={i} className={styles.condition}>
        <Select
          id={`source-${i}`}
          labelText={t('basedOn', 'Based on')}
          value={sourceValue}
          onChange={(e) => changeSource(e.target.value)}
        >
          <SelectItem value="__age" text={t('patientsAge', "Patient's age")} />
          <SelectItem value="__sex" text={t('patientsSex', "Patient's sex")} />
          {others.map((q) => (
            <SelectItem key={q.id} value={q.id} text={labels.question(q.id)} />
          ))}
        </Select>
        {c.kind === 'sex' ? (
          <Select
            id={`sex-${i}`}
            labelText={t('is', 'is')}
            value={c.value}
            onChange={(e) => setCondition(i, { kind: 'sex', value: e.target.value as 'F' })}
          >
            <SelectItem value="F" text={t('female', 'female')} />
            <SelectItem value="M" text={t('male', 'male')} />
          </Select>
        ) : (
          <Select
            id={`op-${i}`}
            labelText={t('comparison', 'Comparison')}
            value={comparison}
            onChange={(e) => changeComparison(e.target.value)}
          >
            {comparisons.map((x) => (
              <SelectItem key={x.value} value={x.value} text={x.text} />
            ))}
          </Select>
        )}
        {(c.kind === 'number' || c.kind === 'age') && (
          <TextInput
            id={`value-${i}`}
            labelText={c.kind === 'age' ? t('years', 'Years') : t('value', 'Value')}
            type="number"
            value={String(c.value)}
            onChange={(e) => setCondition(i, { ...c, value: Number(e.target.value) })}
          />
        )}
        {c.kind === 'answer' && (
          <fieldset className={styles.answers}>
            <legend className="cds--label">{t('anyOfTheseAnswers', 'Any of these answers')}</legend>
            {source?.questionOptions?.answers?.map((a) => (
              <Checkbox
                key={a.concept}
                id={`answer-${i}-${a.concept}`}
                labelText={a.label}
                checked={c.values.includes(a.concept)}
                onChange={(_e, { checked }) => {
                  const values = checked ? [...c.values, a.concept] : c.values.filter((v) => v !== a.concept);
                  if (values.length) setCondition(i, { ...c, values });
                }}
              />
            ))}
          </fieldset>
        )}
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={TrashCan}
          iconDescription={t('removeCondition', 'Remove this condition')}
          onClick={() => {
            const conditions = show.conditions.filter((_x, j) => j !== i);
            updateShow(conditions.length ? { ...show, conditions } : null);
          }}
        />
      </div>
    );
  };

  return (
    <>
      <ModalHeader
        closeModal={closeModal}
        title={t('rulesFor', 'Rules for "{{label}}"', { label: question.label, ...plainText })}
      />
      <ModalBody hasScrollingContent>
        <Stack gap={7}>
          <section>
            <h4 className={styles.heading}>{t('whenToShow', 'When should this question appear?')}</h4>
            <p className={styles.help}>
              {t(
                'whenToShowHelp',
                'Hide questions that only matter after a certain answer, e.g. "Years smoked" only when "Smoker" is Yes.',
              )}
            </p>
            {showCustom && !replaceCustom ? (
              <>
                <InlineNotification
                  kind="info"
                  lowContrast
                  hideCloseButton
                  title={t('writtenByHand', 'This rule was written by hand. It still works and is kept as it is.')}
                  subtitle={showCustom}
                />
                <Button kind="ghost" size="sm" onClick={() => setReplaceCustom(true)}>
                  {t('replaceWithSimpleRule', 'Replace it with a simple rule')}
                </Button>
              </>
            ) : (
              <>
                <RadioButtonGroup
                  name="show-mode"
                  legendText=""
                  valueSelected={show ? 'when' : 'always'}
                  onChange={(value) =>
                    updateShow(value === 'always' ? null : { join: 'all', conditions: [newCondition()] })
                  }
                >
                  <RadioButton id="show-always" value="always" labelText={t('always', 'Always')} />
                  <RadioButton id="show-when" value="when" labelText={t('onlyWhen', 'Only when…')} />
                </RadioButtonGroup>
                {show && (
                  <div className={styles.conditions}>
                    {show.conditions.length > 1 && (
                      <Select
                        id="join"
                        labelText={t('combine', 'Combine the conditions')}
                        value={show.join}
                        onChange={(e) => updateShow({ ...show, join: e.target.value as 'all' })}
                      >
                        <SelectItem value="all" text={t('allTrue', 'All of them must be true')} />
                        <SelectItem value="any" text={t('anyTrue', 'Any one of them is enough')} />
                      </Select>
                    )}
                    {show.conditions.map(conditionRow)}
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Add}
                      onClick={() => updateShow({ ...show, conditions: [...show.conditions, newCondition()] })}
                    >
                      {t('addCondition', 'Add another condition')}
                    </Button>
                    <p className={styles.sentence}>{describeShow(show, labels)}</p>
                  </div>
                )}
              </>
            )}
          </section>

          {isNumber && (
            <section>
              <h4 className={styles.heading}>{t('warnUnusual', 'Warn if the value is unusual')}</h4>
              <p className={styles.help}>
                {t('warnUnusualHelp', 'Shows a yellow warning to double-check the value. The form can still be saved.')}
              </p>
              {rules.warn && 'custom' in rules.warn && (
                <p className={styles.help}>
                  {t(
                    'warnWrittenByHand',
                    'Current warning (written by hand, replaced if you fill these in): {{rule}}',
                    { rule: rules.warn.custom, ...plainText },
                  )}
                </p>
              )}
              <div className={styles.pair}>
                <TextInput
                  id="warn-below"
                  type="number"
                  labelText={t('warnBelow', 'Warn below')}
                  value={below}
                  onChange={(e) => setBelow(e.target.value)}
                />
                <TextInput
                  id="warn-above"
                  type="number"
                  labelText={t('warnAbove', 'Warn above')}
                  value={above}
                  onChange={(e) => setAbove(e.target.value)}
                />
              </div>
            </section>
          )}

          {isNumber && (
            <section>
              <h4 className={styles.heading}>{t('numberFormat', 'Number format')}</h4>
              <p className={styles.help}>
                {t('numberFormatHelp', 'The form will not save a value with more decimals than this.')}
              </p>
              <RadioButtonGroup
                name="decimals"
                legendText=""
                valueSelected={decimals}
                onChange={(value) => setDecimals(String(value))}
              >
                <RadioButton id="dec-any" value="any" labelText={t('anyNumber', 'Any number')} />
                <RadioButton id="dec-0" value="0" labelText={t('wholeOnly', 'Whole numbers only')} />
                <RadioButton id="dec-1" value="1" labelText={t('oneDecimal', 'Up to 1 decimal')} />
                <RadioButton id="dec-2" value="2" labelText={t('twoDecimals', 'Up to 2 decimals')} />
              </RadioButtonGroup>
            </section>
          )}

          {(isNumber || question.questionOptions?.rendering === 'date') && (
            <section>
              <h4 className={styles.heading}>{t('fillInByItself', 'Fill in by itself')}</h4>
              <p className={styles.help}>
                {t('fillInByItselfHelp', 'The value is worked out from other answers and cannot be typed.')}
              </p>
              {calcCustom ? (
                <p className={styles.help}>
                  {t('calcWrittenByHand', 'Worked out by a formula written by hand (kept as it is): {{rule}}', {
                    rule: calcCustom,
                    ...plainText,
                  })}
                </p>
              ) : (
                <>
                  <Select
                    id="calc-kind"
                    labelText={t('workedOutAs', 'Worked out as')}
                    value={calc?.kind ?? 'none'}
                    onChange={(e) => {
                      const kind = e.target.value;
                      const next: CalcRule | null =
                        kind === 'bmi'
                          ? { kind: 'bmi', height: numbers[0]?.id ?? '', weight: numbers[1]?.id ?? '' }
                          : kind === 'edd'
                            ? { kind: 'edd', lnmp: dates[0]?.id ?? '' }
                            : null;
                      setCalc(next);
                      setEdits((x) => ({ ...x, calc: next }));
                    }}
                  >
                    <SelectItem value="none" text={t('typedIn', 'Typed in (not worked out)')} />
                    {isNumber && <SelectItem value="bmi" text={t('bmi', 'BMI from height (cm) and weight (kg)')} />}
                    <SelectItem value="edd" text={t('edd', 'Expected delivery date from the last period (LNMP)')} />
                  </Select>
                  {calc?.kind === 'bmi' && (
                    <div className={styles.pair}>
                      {(['height', 'weight'] as const).map((part) => (
                        <Select
                          key={part}
                          id={`calc-${part}`}
                          labelText={
                            part === 'height'
                              ? t('heightQuestion', 'Height question')
                              : t('weightQuestion', 'Weight question')
                          }
                          value={calc[part]}
                          onChange={(e) => {
                            const next = { ...calc, [part]: e.target.value };
                            setCalc(next);
                            setEdits((x) => ({ ...x, calc: next }));
                          }}
                        >
                          {numbers.map((q) => (
                            <SelectItem key={q.id} value={q.id} text={labels.question(q.id)} />
                          ))}
                        </Select>
                      ))}
                    </div>
                  )}
                  {calc?.kind === 'edd' && (
                    <Select
                      id="calc-lnmp"
                      labelText={t('lnmpQuestion', 'Last period (LNMP) question')}
                      value={calc.lnmp}
                      onChange={(e) => {
                        const next = { kind: 'edd' as const, lnmp: e.target.value };
                        setCalc(next);
                        setEdits((x) => ({ ...x, calc: next }));
                      }}
                    >
                      {dates.map((q) => (
                        <SelectItem key={q.id} value={q.id} text={labels.question(q.id)} />
                      ))}
                    </Select>
                  )}
                </>
              )}
            </section>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={save}>{t('saveRules', 'Save rules')}</Button>
      </ModalFooter>
    </>
  );
};

export default QuestionRulesModal;
