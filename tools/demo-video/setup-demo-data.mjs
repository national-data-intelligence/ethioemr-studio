// Step 0: make sure the EMR has the demo data the platform video needs (safe to run repeatedly).
//  - synthetic patient "Almaz Bekele" with an open outpatient visit
//  - a provider record for the admin user (the triage form cannot be saved without one)
// Writes the patient's uuid to build/demo.json for record-platform.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API = (process.env.EMR_URL || 'http://localhost:18200/openmrs') + '/ws/rest/v1/';
const AUTH = 'Basic ' + Buffer.from('admin:Admin123').toString('base64');
// login location (override with DEMO_LOCATION)
const LOCATION = process.env.DEMO_LOCATION || '7f65d926-57d6-4402-ae10-a5b3bcbf7986'; // Main Pharmacy
const OUTPATIENT = '3371a4d4-f66f-4454-a86d-92c7b3da990c';
const OPENMRS_ID = 'dfacd928-0370-4315-99d7-6ec1c9f7ae76';
const ID_SOURCE = 'fb034aac-2353-4940-abe2-7bc94e7c1e71';
const TRIAGE = 'd1059fb9-a079-4feb-a749-eedd709ae542';      // encounter type "Triage"
const TRIAGE_FORM = 'ff723d59-0650-4b84-858d-c1045b690683'; // "Central Triage Form"
const CLINICIAN_ROLE = '240b26f9-dd88-4172-823d-4a8bfeb7841f'; // "Clinician" encounter role in this EMR
const VITALS = {
  '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 130, '5086AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 85, '5088AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 38.2,
  '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 96, '5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 62, '5090AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 160,
};

async function rest(method, url, body) {
  const r = await fetch(API + url, { method, headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(`${method} ${url}: ${JSON.stringify(j?.error ?? j)}`);
  return j;
}

const session = await rest('GET', 'session?v=custom:(user:(person:(uuid)))');
const adminPerson = session.user.person.uuid;
const prov = await rest('GET', `provider?q=DEMO-001&v=custom:(uuid)`);
if (!prov.results.length) { await rest('POST', 'provider', { person: adminPerson, identifier: 'DEMO-001' }); console.log('created provider DEMO-001'); }

let pt = (await rest('GET', 'patient?q=Almaz%20Bekele&v=custom:(uuid)')).results[0];
if (!pt) {
  const { identifier } = await rest('POST', `idgen/identifiersource/${ID_SOURCE}/identifier`, {});
  pt = await rest('POST', 'patient', {
    person: {
      names: [{ givenName: 'Almaz', familyName: 'Bekele' }], gender: 'F', birthdate: '1992-03-14',
      addresses: [{ stateProvince: 'Addis Ababa City Administration', countyDistrict: 'Addis Ketema Sub City', address4: 'Woreda 1', country: 'Ethiopia' }],
    },
    identifiers: [{ identifier, identifierType: OPENMRS_ID, location: LOCATION, preferred: true }],
  });
  console.log(`created patient Almaz Bekele (${identifier})`);
}
let visit = (await rest('GET', `visit?patient=${pt.uuid}&includeInactive=false&v=custom:(uuid)`)).results[0];
if (!visit) { visit = await rest('POST', 'visit', { patient: pt.uuid, visitType: OUTPATIENT, location: LOCATION }); console.log('started outpatient visit'); }

// Vitals for the Diagnosis scene (same values the Central Triage form saves in the Form Filler scene).
if (process.argv.includes('--with-vitals')) {
  const enc = await rest('GET', `encounter?patient=${pt.uuid}&encounterType=${TRIAGE}&v=custom:(uuid)`);
  if (!enc.results.length) {
    const obs = Object.entries(VITALS).map(([concept, value]) => ({ concept, value }));
    const provider = (await rest('GET', 'provider?q=DEMO-001&v=custom:(uuid)')).results[0].uuid;
    await rest('POST', 'encounter', {
      patient: pt.uuid, visit: visit.uuid, encounterType: TRIAGE, form: TRIAGE_FORM, location: LOCATION,
      encounterDatetime: new Date(Date.now() - 60000).toISOString(), obs,
      encounterProviders: [{ provider, encounterRole: CLINICIAN_ROLE }],
    });
    console.log('saved triage vitals: BP 130/85, T 38.2, P 96, Wt 62, Ht 160');
  }
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'demo.json'), JSON.stringify({ patient: pt.uuid }, null, 1));
console.log(`demo data ready: patient ${pt.uuid}`);
