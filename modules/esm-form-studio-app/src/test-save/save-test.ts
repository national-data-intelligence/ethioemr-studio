/**
 * Test save: does a form really save on a server? It follows the team's Python save test, since a
 * real save through the REST API is the only reliable check: read each concept's real metadata, build one valid,
 * concept-aware encounter (true or false for Boolean, a real answer for Coded, an in-range number, a date of the
 * right shape), POST it, and when it fails, send each field alone to
 * find every field that fails and the server's own reason. Everything it creates is deleted afterwards.
 *
 * Changes from the Python:
 *  - encounter type from the form itself, location and provider from the session (the Python hard-coded
 *    Consultation and one distro's uuids);
 *  - a decimal for a number the form lets clinicians type with decimals, because "allow decimal = no" on the
 *    concept blocks the save and integer-only testing never saw it; the failure is reported in plain words;
 *  - the server is reached only through the `Rest` passed in, so the same code runs in tests against a fake server.
 *
 * Writes to the server it is given: test patient, encounters, obs, all purged at the end. Run it only on a test
 * instance its owner agreed to.
 */
import { parseDecimals } from '../logic/rules';

export interface RestResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
}
export interface Rest {
  get: (path: string) => Promise<RestResponse>;
  post: (path: string, body: unknown) => Promise<RestResponse>;
  del: (path: string) => Promise<RestResponse>;
}

export interface Field {
  id?: string;
  label: string;
  page: string;
  section: string;
  type?: string;
  rendering?: string;
  concept?: string;
  answers: Array<string>;
  min?: number | string;
  max?: number | string;
  isGroup: boolean;
  groupConcept?: string;
  datasourceClasses?: Array<string>;
  /** the form allows only whole numbers here (a decimals validator with 0 places) */
  wholeOnly: boolean;
}

/** Encounter-level fields: not obs. */
const ENCOUNTER_LEVEL = new Set([
  'encounterDatetime',
  'encounterProvider',
  'encounterLocation',
  'encounterRole',
  'encounterProviderAndRole',
  'patientIdentifier',
  'encounterNote',
]);
const CODED = new Set([
  'radio',
  'ui-select-extended',
  'content-switcher',
  'select',
  'drop-down',
  'checkbox',
  'toggle',
  'multiCheckbox',
]);

/** The form as a flat list of fields; group members carry their group's concept. */
export function parseFields(schema: { pages?: Array<any> }): Array<Field> {
  const fields: Array<Field> = [];
  const visit = (q: any, page: string, section: string, groupConcept?: string) => {
    const o = q.questionOptions ?? {};
    const nested = q.questions ?? o.questions ?? [];
    const isGroup = q.type === 'obsGroup' || nested.length > 0;
    const decimals = (q.validators ?? []).map((v) => parseDecimals(v.failsWhenExpression)).find((d) => d !== undefined);
    const classes = o.datasource?.config?.class;
    fields.push({
      id: q.id,
      label: q.label ?? q.id ?? '(unlabeled)',
      page,
      section,
      type: q.type,
      rendering: o.rendering,
      concept: o.concept,
      answers: (o.answers ?? []).map((a) => a.concept).filter(Boolean),
      min: o.min,
      max: o.max,
      isGroup,
      groupConcept,
      datasourceClasses: classes ? (Array.isArray(classes) ? classes : [classes]) : undefined,
      wholeOnly: decimals === 0 || o.step === 1 || o.step === '1',
    });
    if (isGroup) nested.forEach((child) => visit(child, page, section, o.concept));
  };
  for (const page of schema.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const q of section.questions ?? []) visit(q, page.label, section.label);
    }
  }
  return fields;
}

interface ConceptMeta {
  datatype?: { display?: string };
  allowDecimal?: boolean;
  hiAbsolute?: number;
  lowAbsolute?: number;
  hiNormal?: number;
  lowNormal?: number;
}

export interface Context {
  rest: Rest;
  /** "YYYY-MM-DD HH:MM:SS", a little before the server's clock (Datetime obs values) */
  obsDatetime: string;
  concept: (uuid: string) => Promise<ConceptMeta | undefined>;
  datasourceConcept: (classes: Array<string>) => Promise<string | undefined>;
}

const num = (x: unknown) =>
  x === undefined || x === null || x === '' || Number.isNaN(Number(x)) ? undefined : Number(x);
const NO_ANSWERS = Symbol('no answers');

/** A valid value for a leaf field, or undefined when the field is not an obs. */
export async function valueFor(f: Field, ctx: Context): Promise<unknown> {
  if (!f.concept || ENCOUNTER_LEVEL.has(f.type ?? '') || f.isGroup || f.rendering === 'markdown') return undefined;
  const meta = (await ctx.concept(f.concept)) ?? {};
  const datatype = meta.datatype?.display;
  // the concept's datatype decides the value's shape, whatever the rendering
  if (datatype === 'Boolean') return true;
  if (datatype === 'Date') return ctx.obsDatetime.slice(0, 10);
  if (datatype === 'Datetime') return ctx.obsDatetime;
  if (f.rendering === 'problem' || f.rendering === 'drug') {
    return (f.datasourceClasses && (await ctx.datasourceConcept(f.datasourceClasses))) ?? NO_ANSWERS;
  }
  if (CODED.has(f.rendering ?? '')) {
    if (f.answers.length) return f.answers[0];
    return f.rendering === 'toggle' ? true : NO_ANSWERS;
  }
  if (f.rendering === 'number') {
    const [ln, hn] = [num(meta.lowNormal), num(meta.hiNormal)];
    let value: number;
    if (ln !== undefined && hn !== undefined) {
      value = (ln + hn) / 2;
    } else {
      const lo = Math.max(
        ...[num(meta.lowAbsolute), num(f.min)].filter((v): v is number => v !== undefined),
        -Infinity,
      );
      const hi = Math.min(...[num(meta.hiAbsolute), num(f.max)].filter((v): v is number => v !== undefined), Infinity);
      value =
        Number.isFinite(lo) && Number.isFinite(hi)
          ? lo + (hi - lo) * 0.1
          : Number.isFinite(lo)
            ? lo + 1
            : Number.isFinite(hi)
              ? Math.max(1, hi - 1)
              : 1;
    }
    // whole when the form or the concept wants whole numbers (a realistic entry); a decimal
    // otherwise, so a concept that silently allows none would show. A form that lets clinicians type decimals into
    // a whole-number concept is reported separately (decimalRisks), from the concept's settings, without a save.
    if (f.wholeOnly || meta.allowDecimal === false) return Math.round(value);
    const decimal = Math.floor(value) + 0.5;
    const hiLimit = Math.min(num(meta.hiAbsolute) ?? Infinity, num(f.max) ?? Infinity);
    return decimal <= hiLimit ? decimal : Math.round(value * 100) / 100;
  }
  if (f.rendering === 'date') return ctx.obsDatetime.slice(0, 10);
  if (f.rendering === 'datetime') return ctx.obsDatetime;
  return 'test';
}

export interface Failure {
  label: string;
  page: string;
  section: string;
  rendering?: string;
  concept?: string;
  value: unknown;
  reason: string;
  /** what it means for the form, in plain words, when the reason is a known one */
  plain?: string;
}
export interface SaveResult {
  form: string;
  status: 'PASS' | 'FAIL';
  obsSent: number;
  fullError?: string;
  failures: Array<Failure>;
  /** choice fields with no answers in the form: no value can be tested */
  noAnswers: Array<{ label: string; page: string; section: string; rendering?: string }>;
  /** worth a look: the form lets clinicians type decimals, but the concept allows whole numbers only, so a
   * decimal entry (e.g. 36.8) is refused on save */
  decimalRisks: Array<{ label: string; page: string; section: string; concept?: string; plain: string }>;
}

export interface Session {
  patient: string;
  encounterType: string;
  encounterRole: string;
  location: string;
  provider: string;
  encounterDatetime: string;
  created: { encounters: Array<string>; obs: Array<string>; patient?: string };
}

/** The server's reason as one line. */
export function reasonOf(r: RestResponse): string {
  const e = r.body?.error ?? {};
  const bits = [
    e.message,
    e.fieldErrors
      ? JSON.stringify(e.fieldErrors)
      : String(e.detail ?? '')
          .split('\n')[0]
          .slice(0, 300),
  ];
  return bits.filter(Boolean).join(' | ') || `HTTP ${r.status}`;
}

/** Known server reasons, said plainly for the form builder. */
export function plainReason(reason: string, f: Field, value: unknown): string | undefined {
  if (/Obs\.error\.precision|precision/i.test(reason) && typeof value === 'number' && !Number.isInteger(value)) {
    return `"${f.label}" accepts decimals on the form, but its concept allows whole numbers only, so a value like ${value} can't be saved. Allow decimals on the concept, or set the question to whole numbers only.`;
  }
  if (/not.*valid.*answer|answer.*not.*valid|Obs\.error\.invalid/i.test(reason)) {
    return `"${f.label}": the server does not accept this answer for this concept (the answer isn't one of the concept's answers).`;
  }
  if (/null|does not exist|not found|Unable to find/i.test(reason)) {
    return `"${f.label}": a concept this field uses is missing on this server.`;
  }
  return undefined;
}

function obsOf(f: Field, value: unknown) {
  return { concept: f.concept, value };
}

function collect(obs: Array<any>, into: Array<string>) {
  for (const o of obs ?? []) {
    if (o?.uuid) into.push(o.uuid);
    collect(o?.groupMembers, into);
  }
}

async function post(session: Session, ctx: Context, form: string, obs: Array<unknown>) {
  const r = await ctx.rest.post('encounter', {
    patient: session.patient,
    encounterType: session.encounterType,
    encounterDatetime: session.encounterDatetime,
    location: session.location,
    form,
    encounterProviders: [{ provider: session.provider, encounterRole: session.encounterRole }],
    obs,
  });
  if (r.status === 200 || r.status === 201) {
    session.created.encounters.push(r.body.uuid);
    collect(r.body.obs, session.created.obs);
    return { ok: true as const };
  }
  return { ok: false as const, reason: reasonOf(r) };
}

/** One form: the whole encounter, then each field alone if that fails. */
export async function saveTestForm(
  schema: { name?: string; uuid?: string; pages?: Array<any> },
  session: Session,
  ctx: Context,
): Promise<SaveResult> {
  const fields = parseFields(schema);
  const leaves: Array<{ f: Field; value: unknown }> = [];
  const noAnswers: SaveResult['noAnswers'] = [];
  const decimalRisks: SaveResult['decimalRisks'] = [];
  const top: Array<any> = [];
  const groups = new Map<string, Array<unknown>>();
  for (const f of fields) {
    const value = await valueFor(f, ctx);
    if (value === NO_ANSWERS) {
      noAnswers.push({ label: f.label, page: f.page, section: f.section, rendering: f.rendering });
      continue;
    }
    if (value === undefined) continue;
    if (
      f.rendering === 'number' &&
      !f.wholeOnly &&
      f.concept &&
      (await ctx.concept(f.concept))?.allowDecimal === false
    ) {
      decimalRisks.push({
        label: f.label,
        page: f.page,
        section: f.section,
        concept: f.concept,
        plain: `"${f.label}" lets clinicians type decimals, but its concept allows whole numbers only, so an entry like 36.8 is refused when the form is saved. Set the question to "Whole numbers only" in Rules, or allow decimals on the concept.`,
      });
    }
    leaves.push({ f, value });
    if (f.groupConcept) {
      if (!groups.has(f.groupConcept)) groups.set(f.groupConcept, []);
      groups.get(f.groupConcept).push(obsOf(f, value));
    } else {
      top.push(obsOf(f, value));
    }
  }
  for (const f of fields) {
    if (f.isGroup && f.concept && groups.has(f.concept))
      top.push({ concept: f.concept, groupMembers: groups.get(f.concept) });
  }
  const result: SaveResult = {
    form: schema.name ?? '(unnamed)',
    status: 'PASS',
    obsSent: leaves.length,
    failures: [],
    noAnswers,
    decimalRisks,
  };
  const full = await post(session, ctx, schema.uuid, top);
  if (full.ok) return result;
  result.status = 'FAIL';
  result.fullError = full.reason;
  for (const { f, value } of leaves) {
    const single = f.groupConcept ? [{ concept: f.groupConcept, groupMembers: [obsOf(f, value)] }] : [obsOf(f, value)];
    const one = await post(session, ctx, schema.uuid, single);
    if (!one.ok) {
      result.failures.push({
        label: f.label,
        page: f.page,
        section: f.section,
        rendering: f.rendering,
        concept: f.concept,
        value,
        reason: one.reason,
        plain: plainReason(one.reason, f, value),
      });
    }
  }
  return result;
}

/** Everything a run needs from the server, found rather than hard-coded. Creates the throwaway test patient. */
export async function openSession(rest: Rest, encounterTypeName: string): Promise<{ session: Session; ctx: Context }> {
  const s = await rest.get('session?v=custom:(authenticated,sessionLocation:(uuid),currentProvider:(uuid))');
  if (!s.body?.authenticated) throw new Error('Not logged in to the server.');
  const location = s.body.sessionLocation?.uuid;
  const provider = s.body.currentProvider?.uuid;
  if (!location || !provider)
    throw new Error('The session has no location or no provider: log in with a provider account and pick a location.');
  const serverNow = s.headers?.date ? new Date(s.headers.date) : new Date();
  const when = new Date(serverNow.getTime() - 10 * 60_000); // a little before the server's clock
  const pad = (n: number) => String(n).padStart(2, '0');
  const obsDatetime = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}`;
  const encounterDatetime = when.toISOString().replace('Z', '+0000');

  const byName = async (resource: string, name: string) => {
    const r = await rest.get(`${resource}?q=${encodeURIComponent(name)}&v=custom:(uuid,display,name)`);
    const rows: Array<any> = r.body?.results ?? [];
    return rows.find((x) => (x.name ?? x.display ?? '').toLowerCase() === name.toLowerCase())?.uuid;
  };
  const encounterType = await byName('encountertype', encounterTypeName);
  if (!encounterType) throw new Error(`Encounter type "${encounterTypeName}" is not on this server.`);
  const encounterRole =
    (await byName('encounterrole', 'Clinician')) ??
    (await rest.get('encounterrole?v=custom:(uuid)')).body?.results?.[0]?.uuid;

  // the throwaway patient, with a generated id of the identifier type the server requires (EthioEMR calls it
  // "MRN"; the reference application "OpenMRS ID"), from a generator for that type
  const idTypes = (await rest.get('patientidentifiertype?v=custom:(uuid,name,required)')).body?.results ?? [];
  const idType = (idTypes.find((t) => t.required) ?? idTypes.find((t) => /openmrs id/i.test(t.name ?? '')))?.uuid;
  const sources = (await rest.get('idgen/identifiersource?v=custom:(uuid,identifierType:(uuid))')).body?.results ?? [];
  const source = sources.find((x) => x.identifierType?.uuid === idType)?.uuid;
  if (!idType || !source) throw new Error('No required patient identifier type with an id generator on this server.');
  const id = await rest.post(`idgen/identifiersource/${source}/identifier`, {});
  if (id.status !== 200 && id.status !== 201) throw new Error(`Could not generate a patient id: ${reasonOf(id)}`);
  const patient = await rest.post('patient', {
    person: {
      names: [{ givenName: 'ZZFormStudioTest', familyName: 'DoNotUse' }],
      gender: 'F',
      birthdate: '1990-01-01',
    },
    identifiers: [{ identifier: id.body.identifier, identifierType: idType, location, preferred: true }],
  });
  if (patient.status !== 200 && patient.status !== 201)
    throw new Error(`Could not create the test patient: ${reasonOf(patient)}`);

  const cache = new Map<string, Promise<ConceptMeta | undefined>>();
  const dsCache = new Map<string, Promise<string | undefined>>();
  const ctx: Context = {
    rest,
    obsDatetime,
    concept: (uuid) => {
      if (!cache.has(uuid)) {
        cache.set(
          uuid,
          rest
            .get(
              `concept/${encodeURIComponent(uuid)}?v=custom:(uuid,datatype:(display),allowDecimal,hiAbsolute,lowAbsolute,hiNormal,lowNormal)`,
            )
            .then((r) => (r.status === 200 ? r.body : undefined)),
        );
      }
      return cache.get(uuid);
    },
    datasourceConcept: (classes) => {
      const key = [...classes].sort().join(',');
      if (!dsCache.has(key)) {
        dsCache.set(
          key,
          rest
            .get('concept?q=a&limit=60&v=custom:(uuid,conceptClass:(uuid))')
            .then((r) => (r.body?.results ?? []).find((c) => classes.includes(c.conceptClass?.uuid))?.uuid),
        );
      }
      return dsCache.get(key);
    },
  };
  return {
    session: {
      patient: patient.body.uuid,
      encounterType,
      encounterRole,
      location,
      provider,
      encounterDatetime,
      created: { encounters: [], obs: [], patient: patient.body.uuid },
    },
    ctx,
  };
}

/** Delete everything the run created: obs first (no cascade), then encounters, then the patient; void if purge fails. */
export async function cleanUp(rest: Rest, session: Session) {
  const left: Array<string> = [];
  for (const o of session.created.obs) await rest.del(`obs/${o}?purge=true`);
  for (const e of session.created.encounters) {
    const r = await rest.del(`encounter/${e}?purge=true`);
    if (r.status !== 200 && r.status !== 204) {
      await rest.del(`encounter/${e}`);
      left.push(`encounter ${e} voided (purge refused)`);
    }
  }
  if (session.created.patient) {
    const r = await rest.del(`patient/${session.created.patient}?purge=true`);
    if (r.status !== 200 && r.status !== 204) {
      await rest.del(`patient/${session.created.patient}`);
      left.push(`patient ${session.created.patient} voided (purge refused)`);
    }
  }
  return left;
}
