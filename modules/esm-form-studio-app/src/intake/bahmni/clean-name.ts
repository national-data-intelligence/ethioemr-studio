/**
 * Bahmni label cleanup, ported from the Python converter's clean_name():
 * codename tokens, form-namespace prefixes, slash artifacts, typos, whole-string abbreviations, de-shouting
 * ALL-CAPS while keeping acronyms. Keep the tables in step with the Python.
 */
const CODENAME = new Set(['peter', 'ayh', 'ayhfp', 'stpeter', 'peters']);
const PREFIX =
  /^(early anc|anc[^,]*,|pnc,|cervical[^,]*,|safe abortion,|pregnant and lactating[^,]*,?|ed triage,?)\s*,?\s*/i;
const TYPO: Record<string, string> = {
  trige: 'triage',
  preclampsia: 'preeclampsia',
  temeperature: 'temperature',
  gestationa: 'gestational',
  cloting: 'clotting',
  counceling: 'counseling',
  councel: 'counsel',
  sceering: 'screening',
  recieved: 'received',
  elligibility: 'eligibility',
  occupional: 'occupational',
  pasy: '',
};
const ABBREV: Record<string, string> = {
  pe: 'Physical Examination',
  lgs: 'Lymphoglandular System',
  cvs: 'Cardiovascular',
  cns: 'Central Nervous System',
  gus: 'Genitourinary',
  mss: 'Musculoskeletal',
  abd: 'Abdomen',
  bce: 'Clinical Breast Examination',
  tbs: 'TB Screening',
  vitals: 'Vitals',
};
const ACRO = new Set(
  (
    'tews abcdo heent spo2 rbs hiv tb dm htn pv lnmp edd ga muac bmi bp rr pr hbsag via hpv scj sti ifa cac pac cbc ' +
    'uop bpp cns cvs gus mss lgs mch pmtct art pnc aph pph anc who fhb id'
  ).split(' '),
);
const lettersOnly = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '');

export function cleanName(raw: string): string {
  if (!raw) return raw;
  let s = raw.replace(/_/g, ' ').trim();
  s = s.replace(/\s*\/+\s*\.?\s*$/, '');
  const words = s.split(/\s+/);
  while (words.length && CODENAME.has(words[0].toLowerCase().replace(/[,.;:]/g, ''))) {
    words.shift();
  }
  s = words.join(' ');
  for (let prev = ''; s !== prev; ) {
    prev = s;
    s = s.replace(PREFIX, '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
  }
  s = s.replace(/\s+(Data|set)$/i, '');
  if (ABBREV[s.toLowerCase()]) return ABBREV[s.toLowerCase()];
  const out: Array<string> = [];
  for (const w of s.split(/\s+/)) {
    const lw = lettersOnly(w);
    if (lw in TYPO) {
      const fix = TYPO[lw];
      if (fix) out.push(/^[A-Z]/.test(w) ? fix[0].toUpperCase() + fix.slice(1) : fix);
    } else {
      out.push(w);
    }
  }
  s = out
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
  if (!s) return raw.trim();
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    s = s
      .split(' ')
      .map((w) => (ACRO.has(lettersOnly(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}
