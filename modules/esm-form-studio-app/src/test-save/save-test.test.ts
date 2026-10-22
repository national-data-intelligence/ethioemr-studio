/**
 * Test save against a fake server (no network): the same rules as the real one where they matter here. It
 * refuses an unknown concept, refuses a decimal on a whole-number concept (Obs.error.precision), keeps what it
 * creates, and refuses to purge an encounter whose obs still exist.
 */
import { describe, expect, it } from 'vitest';
import { compileDecimals } from '../logic/rules';
import { cleanUp, openSession, parseFields, saveTestForm, type Rest } from './save-test';

const YES = '1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NO = '1066AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const DICTIONARY: Record<string, any> = {
  temp: { uuid: 'temp', datatype: { display: 'Numeric' }, allowDecimal: true, lowNormal: 36, hiNormal: 37.5 },
  pulse: { uuid: 'pulse', datatype: { display: 'Numeric' }, allowDecimal: false, lowAbsolute: 0, hiAbsolute: 250 },
  smoker: { uuid: 'smoker', datatype: { display: 'Coded' } },
  onArt: { uuid: 'onArt', datatype: { display: 'Boolean' } },
  dob: { uuid: 'dob', datatype: { display: 'Date' } },
  note: { uuid: 'note', datatype: { display: 'Text' } },
  vitals: { uuid: 'vitals', datatype: { display: 'N/A' } },
  [YES]: { uuid: YES, datatype: { display: 'N/A' } },
};

function fakeServer() {
  const db = { patients: new Set<string>(), encounters: new Map<string, Array<string>>(), obs: new Set<string>() };
  const deletes: Array<string> = [];
  const posted: Array<any> = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const flat = (obs: Array<any>): Array<any> => obs.flatMap((o) => [o, ...flat(o.groupMembers ?? [])]);
  const rest: Rest = {
    get: async (path) => {
      if (path.startsWith('session')) {
        return {
          status: 200,
          body: { authenticated: true, sessionLocation: { uuid: 'loc' }, currentProvider: { uuid: 'prov' } },
          headers: { date: 'Fri, 17 Oct 2026 12:00:00 GMT' },
        };
      }
      if (path.startsWith('encountertype?q=')) {
        const q = decodeURIComponent(path.split('q=')[1].split('&')[0]);
        return {
          status: 200,
          body: { results: q === 'Consultation' ? [{ uuid: 'et-consult', display: 'Consultation' }] : [] },
        };
      }
      if (path.startsWith('encounterrole?q='))
        return { status: 200, body: { results: [{ uuid: 'role', display: 'Clinician' }] } };
      // EthioEMR's required identifier type is named MRN: the test save takes the required one, whatever its name
      if (path.startsWith('patientidentifiertype')) {
        return {
          status: 200,
          body: {
            results: [
              { uuid: 'other', name: 'Driving License Number', required: false },
              { uuid: 'idtype', name: 'MRN', required: true },
            ],
          },
        };
      }
      if (path.startsWith('idgen/identifiersource'))
        return { status: 200, body: { results: [{ uuid: 'src', identifierType: { uuid: 'idtype' } }] } };
      if (path.startsWith('concept/')) {
        const uuid = decodeURIComponent(path.slice(8).split('?')[0]);
        return DICTIONARY[uuid] ? { status: 200, body: DICTIONARY[uuid] } : { status: 404, body: {} };
      }
      return { status: 404, body: {} };
    },
    post: async (path, body: any) => {
      if (path.endsWith('/identifier')) return { status: 200, body: { identifier: '100-1' } };
      if (path === 'patient') {
        const uuid = id('patient');
        db.patients.add(uuid);
        return { status: 201, body: { uuid } };
      }
      if (path === 'encounter') {
        posted.push(body);
        for (const o of flat(body.obs)) {
          const c = DICTIONARY[o.concept];
          if (!c) return { status: 400, body: { error: { message: `Unable to find concept ${o.concept}` } } };
          if (c.allowDecimal === false && typeof o.value === 'number' && !Number.isInteger(o.value)) {
            return {
              status: 400,
              body: {
                error: { message: 'Invalid Submission', fieldErrors: { value: [{ code: 'Obs.error.precision' }] } },
              },
            };
          }
        }
        const uuid = id('enc');
        const withIds = (obs: Array<any>) =>
          obs.map((o) => ({
            ...o,
            uuid: id('obs'),
            groupMembers: o.groupMembers ? withIds(o.groupMembers) : undefined,
          }));
        const obs = withIds(body.obs);
        flat(obs).forEach((o) => db.obs.add(o.uuid));
        db.encounters.set(
          uuid,
          flat(obs).map((o) => o.uuid),
        );
        return { status: 201, body: { uuid, obs } };
      }
      return { status: 404, body: {} };
    },
    del: async (path) => {
      deletes.push(path);
      const [kind, rest] = path.split('/');
      const uuid = rest.split('?')[0];
      if (kind === 'obs') return db.obs.delete(uuid) ? { status: 204, body: {} } : { status: 404, body: {} };
      if (kind === 'encounter') {
        if ((db.encounters.get(uuid) ?? []).some((o) => db.obs.has(o)))
          return { status: 500, body: { error: { message: 'FK: obs still exist' } } };
        return db.encounters.delete(uuid) ? { status: 204, body: {} } : { status: 404, body: {} };
      }
      if (kind === 'patient') return db.patients.delete(uuid) ? { status: 204, body: {} } : { status: 404, body: {} };
      return { status: 404, body: {} };
    },
  };
  return { rest, db, deletes, posted };
}

const q = (id: string, concept: string, rendering: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id,
  type: 'obs',
  questionOptions: { rendering, concept, ...extra },
});
const form = (questions: Array<any>) => ({
  name: 'T',
  uuid: 'form-uuid',
  pages: [{ label: 'P', sections: [{ label: 'S', questions }] }],
});

describe('test save', () => {
  it('a good form saves; everything created is deleted, obs before encounters, the patient last', async () => {
    const server = fakeServer();
    const { session, ctx } = await openSession(server.rest, 'Consultation');
    const result = await saveTestForm(
      form([
        q('temp', 'temp', 'number'),
        q('smoker', 'smoker', 'radio', {
          answers: [
            { concept: YES, label: 'Yes' },
            { concept: NO, label: 'No' },
          ],
        }),
        q('onArt', 'onArt', 'radio', { answers: [{ concept: YES, label: 'Yes' }] }),
        q('dob', 'dob', 'text'),
        {
          id: 'vitals',
          label: 'Vitals',
          type: 'obsGroup',
          questionOptions: { rendering: 'group', concept: 'vitals' },
          questions: [q('note', 'note', 'textarea')],
        },
        { id: 'visitDate', type: 'encounterDatetime', questionOptions: { rendering: 'date' } },
      ]),
      session,
      ctx,
    );
    expect(result).toMatchObject({ status: 'PASS', obsSent: 5, failures: [] });
    const sent = server.posted[0];
    expect(sent).toMatchObject({
      encounterType: 'et-consult',
      location: 'loc',
      form: 'form-uuid',
      encounterProviders: [{ provider: 'prov', encounterRole: 'role' }],
    });
    const byConcept = Object.fromEntries(sent.obs.map((o) => [o.concept, o]));
    expect(byConcept.temp.value).toBe(36.5); // a decimal: the form accepts decimals here
    expect(byConcept.onArt.value).toBe(true); // Boolean concept: true, not an answer uuid
    expect(byConcept.dob.value).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Date concept rendered as text: a date
    expect(byConcept.vitals.groupMembers).toEqual([{ concept: 'note', value: 'test' }]);

    expect(await cleanUp(server.rest, session)).toEqual([]);
    expect(server.db.obs.size + server.db.encounters.size + server.db.patients.size).toBe(0);
    const order = server.deletes.map((d) => d.split('/')[0]);
    expect(order.lastIndexOf('obs')).toBeLessThan(order.indexOf('encounter'));
    expect(order.at(-1)).toBe('patient');
  });

  it('a failing form: every failing field found, with the reason in plain words', async () => {
    const server = fakeServer();
    const { session, ctx } = await openSession(server.rest, 'Consultation');
    const result = await saveTestForm(
      form([q('temp', 'temp', 'number'), q('ghost', 'ghost-concept', 'text'), q('note', 'note', 'text')]),
      session,
      ctx,
    );
    expect(result.status).toBe('FAIL');
    expect(result.failures.map((f) => f.label)).toEqual(['ghost']);
    expect(result.failures[0].plain).toContain('missing on this server');
    await cleanUp(server.rest, session);
    expect(server.db.obs.size + server.db.encounters.size + server.db.patients.size).toBe(0);
  });

  it('decimals the concept refuses: the save uses a whole number, and the risk is listed for the form builder', async () => {
    const server = fakeServer();
    const { session, ctx } = await openSession(server.rest, 'Consultation');
    const result = await saveTestForm(form([q('pulse', 'pulse', 'number')]), session, ctx);
    expect(result.status).toBe('PASS');
    expect(Number.isInteger(server.posted[0].obs[0].value)).toBe(true);
    expect(result.decimalRisks.map((r) => r.label)).toEqual(['pulse']);
    expect(result.decimalRisks[0].plain).toContain('Whole numbers only');
    // a decimal sent anyway is refused by the server, and said plainly (the reason the risk is listed)
    const refused = await saveTestForm(
      form([{ ...q('pulse', 'pulse', 'number'), questionOptions: { rendering: 'number', concept: 'pulse' } }]),
      session,
      {
        ...ctx,
        concept: async () => ({ datatype: { display: 'Numeric' }, lowNormal: 60.2, hiNormal: 100.6 }),
      },
    );
    expect(refused.failures[0].plain).toContain('allows whole numbers only');
    await cleanUp(server.rest, session);
  });

  it('a number the form keeps to whole numbers is sent whole, so it saves', async () => {
    const server = fakeServer();
    const { session, ctx } = await openSession(server.rest, 'Consultation');
    // the rule Form Studio writes for "Whole numbers only" (Rules window)
    const whole = {
      ...q('pulse', 'pulse', 'number'),
      validators: [{ type: 'js_expression', failsWhenExpression: compileDecimals(0) }],
    };
    expect(parseFields(form([whole]))[0].wholeOnly).toBe(true);
    const result = await saveTestForm(form([whole]), session, ctx);
    expect(result.status).toBe('PASS');
    expect(Number.isInteger(server.posted[0].obs[0].value)).toBe(true);
    await cleanUp(server.rest, session);
  });

  it('a choice question with no answers is listed, not sent', async () => {
    const server = fakeServer();
    const { session, ctx } = await openSession(server.rest, 'Consultation');
    const result = await saveTestForm(form([q('smoker', 'smoker', 'select'), q('note', 'note', 'text')]), session, ctx);
    expect(result).toMatchObject({ status: 'PASS', obsSent: 1, noAnswers: [{ label: 'smoker', rendering: 'select' }] });
    await cleanUp(server.rest, session);
  });

  it("refuses to start when the form's encounter type is not on the server", async () => {
    await expect(openSession(fakeServer().rest, 'Not A Type')).rejects.toThrow(
      'Encounter type "Not A Type" is not on this server.',
    );
  });
});
