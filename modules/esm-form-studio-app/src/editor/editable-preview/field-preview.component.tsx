/**
 * What one question looks like in the editable preview: a disabled Carbon field (labels kept at full strength in
 * editable-preview.scss) chosen by `questionOptions.rendering`, close to what the form engine draws. It never runs the form's logic; the real
 * engine preview (right-hand Preview tab) does that.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  Toggle,
} from '@carbon/react';

export interface PreviewQuestion {
  id?: string;
  label?: string;
  type?: string;
  required?: unknown;
  value?: unknown;
  questionOptions?: {
    rendering?: string;
    answers?: Array<{ label?: string; concept?: string }>;
    [key: string]: unknown;
  };
  questions?: Array<PreviewQuestion>;
  [key: string]: unknown;
}

const isTrue = (value: unknown) => value === true || value === 'true';

export const questionLabel = (question: PreviewQuestion) =>
  `${question.label ?? question.id ?? ''}${isTrue(question.required) ? ' *' : ''}`;

const FieldPreview: React.FC<{ question: PreviewQuestion }> = ({ question }) => {
  const { t } = useTranslation();
  const rendering = question.questionOptions?.rendering ?? '';
  const answers = question.questionOptions?.answers ?? [];
  const id = `preview-${question.id ?? 'question'}`;
  const label = questionLabel(question);

  if (question.type === 'markdown' || rendering === 'markdown') {
    const text = Array.isArray(question.value) ? question.value.join('\n') : String(question.value ?? label);
    return <ReactMarkdown>{text}</ReactMarkdown>;
  }

  switch (rendering) {
    case 'textarea':
      return <TextArea id={id} labelText={label} rows={2} disabled />;
    case 'number':
      return <TextInput id={id} labelText={label} type="number" disabled />;
    case 'date':
      return <TextInput id={id} labelText={label} placeholder="dd/mm/yyyy" disabled />;
    case 'datetime':
      return <TextInput id={id} labelText={label} placeholder="dd/mm/yyyy  --:--" disabled />;
    case 'radio':
      return (
        <RadioButtonGroup legendText={label} name={id} disabled>
          {answers.map((answer, i) => (
            <RadioButton key={i} id={`${id}-${i}`} labelText={answer.label ?? ''} value={String(i)} />
          ))}
        </RadioButtonGroup>
      );
    case 'checkbox':
    case 'multiCheckbox':
    case 'checkbox-searchable':
      return (
        <fieldset>
          <legend className="cds--label">{label}</legend>
          {answers.map((answer, i) => (
            <Checkbox key={i} id={`${id}-${i}`} labelText={answer.label ?? ''} disabled />
          ))}
        </fieldset>
      );
    case 'select':
    case 'ui-select-extended':
    case 'content-switcher':
      return (
        <Select id={id} labelText={label} disabled>
          <SelectItem value="" text={answers.length ? answers.map((a) => a.label).join(' / ') : t('choose', 'Choose…')} />
        </Select>
      );
    case 'toggle':
      return <Toggle id={id} labelText={label} disabled />;
    default:
      return <TextInput id={id} labelText={label} disabled />;
  }
};

export default FieldPreview;
