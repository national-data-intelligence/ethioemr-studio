import { describe, expect, it } from 'vitest';
import { cleanName } from './clean-name';
import { parseCsv } from './csv';
import { bahmniToIntake } from './read-bahmni';

it('reads quoted CSV with commas, doubled quotes and newlines', () => {
  const rows = parseCsv('﻿name,description\r\n"A, B","say ""hi""\nthere"\n,\n');
  expect(rows).toEqual([{ name: 'A, B', description: 'say "hi"\nthere' }]);
});

it('cleans Bahmni labels like the Python builder', () => {
  expect(cleanName('peter_integumentary_examination')).toBe('Integumentary examination');
  expect(cleanName('Temeperature////')).toBe('Temperature');
  expect(cleanName('CVS')).toBe('Cardiovascular');
  expect(cleanName('HIV TEST RESULT')).toBe('HIV Test Result');
  expect(cleanName('ED Triage, Pain Score Data')).toBe('Pain Score');
});

describe('Bahmni export -> intake form', () => {
  const sets = [
    'uuid,name,description,class,shortname,child.1,child.2,child.3,child.26',
    's1,Cardiac Visit,,Misc,,Vitals,Exam,Smoker,',
    's2,Vitals,,Misc,,Systolic Data,Pulse,,',
    's3,Systolic Data,,Concept Details,,Systolic,Systolic Abnormal,,',
    's4,Exam,,Misc,,Posture,Notes,,Late child',
  ].join('\n');
  const concepts = [
    'uuid,name,description,class,shortname,datatype,answer.1,answer.2',
    'c1,Systolic,,Misc,Systolic,Numeric,,',
    'c2,Systolic Abnormal,,Abnormal,,Boolean,,',
    '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAA,Pulse,**required**,Misc,,Numeric,,',
    'c4,Posture,**multiSelect**,Misc,,Coded,Sitting,Supine',
    'c5,Sitting,,Misc,,N/A,,',
    'c6,Supine,,Misc,,N/A,,',
    'c7,Notes,,Misc,,Text,,',
    'c8,Smoker,,Misc,,Boolean,,',
    'c9,Late child,**allowFutureDates**,Misc,,Date,,',
  ].join('\n');
  const form = bahmniToIntake(concepts, sets, 'Cardiac Visit');

  it('builds pages and sections from the sets, dropping Abnormal toggles', () => {
    expect(form.name).toBe('Cardiac Visit');
    expect(form.pages).toHaveLength(1);
    expect(form.pages[0].label).toBe('Cardiac Visit Assessment');
    // original order: Vitals, Exam, then the loose Smoker field (no longer moved to the top)
    expect(form.pages[0].sections.map((s) => s.label)).toEqual(['Vitals', 'Exam', 'Assessment']);
    expect(form.pages[0].sections[0].questions.map((q) => q.label)).toEqual(['Systolic', 'Pulse']);
    expect(form.pages[0].sections[2].questions.map((q) => q.label)).toEqual(['Smoker']);
  });

  it('keeps children past the 25th', () => {
    expect(form.pages[0].sections[1].questions.map((q) => q.label)).toEqual(['Posture', 'Notes', 'Late child']);
  });

  it('maps datatypes and reads the description flags', () => {
    const [systolic, pulse] = form.pages[0].sections[0].questions;
    const [posture, notes, late] = form.pages[0].sections[1].questions;
    const [smoker] = form.pages[0].sections[2].questions;
    expect(smoker.type).toBe('yes/no');
    expect(systolic).toMatchObject({ type: 'number', warnBelow: 90, warnAbove: 120 });
    expect(pulse).toMatchObject({ type: 'number', required: true, cielHint: '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    expect(posture.type).toBe('many of');
    expect(posture.options.map((o) => o.label)).toEqual(['Sitting', 'Supine']);
    expect(notes.type).toBe('text');
    expect(late).toMatchObject({ type: 'date', allowFutureDates: true });
  });

  it('never carries the Bahmni uuids, only CIEL hints', () => {
    const all = JSON.stringify(form);
    for (const foreign of ['"c1"', '"c4"', '"c9"']) {
      expect(all).not.toContain(foreign);
    }
  });
});

describe('structure', () => {
  const sets = [
    'uuid,name,description,class,shortname,child.1,child.2,child.3,child.4',
    's1,Exam Form,,Misc,,Intro note,HEENT,Graph,Chief Complaint Data',
    's2,HEENT,,Misc,,Eye,Tonsils,,',
    's3,Eye,,Misc,,Pupils,Drains,,',
    's6,Drains,**allowAddMore**,Misc,,Drain site,Drain output,,',
    's5,Graph,,Graph,,Graph Data,Drug given,,',
    's7,Chief Complaint Data,,Concept Details,,Chief Complaint,Chief Complaint Duration,,',
  ].join('\n');
  const concepts = [
    'uuid,name,description,class,shortname,datatype',
    'c1,Intro note,,Misc,,Text',
    'c2,Pupils,,Misc,,Text',
    'c3,Tonsils,,Misc,,Text',
    'c4,Graph Data,,Misc,,Text',
    'c5,Drug given,,Misc,,Text',
    'c6,Drain site,,Misc,,Text',
    'c7,Drain output,,Misc,,Numeric',
    'c8,Chief Complaint,,Misc,,Text',
    'c9,Chief Complaint Duration,,Duration,,Numeric',
  ].join('\n');
  const form = bahmniToIntake(concepts, sets, 'Exam Form');
  const sections = form.pages.flatMap((p) => p.sections);
  const sig = (q) =>
    q.type === 'group'
      ? `group(${q.repeat ? 'repeat' : 'once'}):${q.label}[${q.children.map((c) => c.label).join(', ')}]`
      : `${q.type}:${q.label}`;

  it("keeps nested set names as headings, the original order, and a Graph set's real fields", () => {
    expect(sections.map((s) => s.label)).toEqual(['Assessment', 'HEENT', 'Graph', 'Assessment 2']);
    expect(sections[1].questions.map(sig)).toEqual([
      'note:Eye',
      'text:Pupils',
      'group(repeat):Drains[Drain site, Drain output]',
      'text:Tonsils',
    ]);
    expect(sections[2].questions.map((q) => q.label)).toEqual(['Drug given']);
  });

  it('builds repeating groups for allowAddMore sets and Chief Complaint Data', () => {
    expect(sections[3].questions.map(sig)).toEqual([
      'group(repeat):Chief Complaint[Chief Complaint, Chief Complaint Duration]',
    ]);
    expect(form.problems.some((p) => /repeating groups: .*Chief Complaint/.test(p.message))).toBe(true);
  });
});
