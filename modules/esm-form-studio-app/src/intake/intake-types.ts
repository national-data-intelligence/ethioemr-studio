/**
 * The common shape every intake produces before it becomes an O3 form: a Bahmni export and the Excel template
 * both turn into an IntakeForm, then the same steps run on it (match concepts, build the schema, open in the
 * editor). The question types are the template's plain words.
 */
export const INTAKE_TYPES = [
  'text',
  'long text',
  'number',
  'date',
  'date-time',
  'time',
  'yes/no',
  'one of',
  'many of',
  'dropdown',
  'calculated',
  'note',
] as const;
export type IntakeType = (typeof INTAKE_TYPES)[number];

/** A concept chosen on the server, and how it was found. */
export interface ConceptMatch {
  uuid: string;
  display: string;
  datatype?: string;
  how:
    | 'same question in the shipped form'
    | 'given uuid'
    | 'CIEL id'
    | 'exact name'
    | 'answer of the question concept'
    | 'standard yes/no';
}

export interface IntakeOption {
  label: string;
  /** a uuid or an exact concept name written in the source */
  concept?: string;
  /** other names to try (e.g. the Bahmni concept name behind the label) */
  names?: Array<string>;
  /** a CIEL id from the source: used only if it exists on this server (no foreign uuids) */
  cielHint?: string;
  match?: ConceptMatch;
}

export interface IntakeQuestion {
  label: string;
  id?: string;
  /** 'group': questions saved together under one set concept (O3 obsGroup); `repeat` makes it repeating */
  type: IntakeType | 'group';
  /** the questions inside a group */
  children?: Array<IntakeQuestion>;
  concept?: string;
  names?: Array<string>;
  cielHint?: string;
  options?: Array<IntakeOption>;
  required?: boolean;
  min?: number;
  max?: number;
  whole?: boolean;
  unit?: string;
  warnBelow?: number;
  warnAbove?: number;
  allowFutureDates?: boolean;
  showIf?: string;
  calculation?: string;
  repeat?: boolean;
  fromEmr?: boolean;
  /** reviewer notes from the source (warning flags, Bahmni quirks); never built into the form */
  notes?: Array<string>;
  match?: ConceptMatch;
  /** why no concept was chosen */
  unmatched?: string;
}

export interface IntakeSection {
  label: string;
  questions: Array<IntakeQuestion>;
  /** the source lets this block be filled many times (Bahmni allowAddMore on a set) */
  repeat?: boolean;
}

export interface IntakePage {
  label: string;
  sections: Array<IntakeSection>;
}

export interface IntakeForm {
  source: 'bahmni' | 'excel';
  name: string;
  description?: string;
  encounter?: string;
  /** an existing form's name or uuid this rebuilds (its identity is kept) */
  replaces?: string;
  version?: string;
  pages: Array<IntakePage>;
  /** problems found while reading the file */
  problems: Array<IntakeIssue>;
}

export interface IntakeIssue {
  level: 'error' | 'warning' | 'info';
  /** where: "Page › Section › Question", or a row number */
  where?: string;
  message: string;
}

/** Every question, groups and the questions inside them included. */
export const allQuestions = (form: IntakeForm) => {
  const out: Array<{ page: IntakePage; section: IntakeSection; question: IntakeQuestion }> = [];
  const visit = (page: IntakePage, section: IntakeSection, question: IntakeQuestion) => {
    out.push({ page, section, question });
    question.children?.forEach((child) => visit(page, section, child));
  };
  form.pages.forEach((page) =>
    page.sections.forEach((section) => section.questions.forEach((q) => visit(page, section, q))),
  );
  return out;
};
