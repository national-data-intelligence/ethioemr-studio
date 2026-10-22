---
title: What Form Studio is
audience: form builders
---
# What Form Studio is

Form Studio turns a clinical form (on paper, in Word, in Excel or in Bahmni) into a form the
EthioEMR can show to clinicians, and checks it before anyone uses it.

## How Form Studio works, step by step

1. **Start** a form: from scratch, from a Bahmni export, or from the Excel template.
2. **Edit** it on screen. You see the form as clinicians will, with pencil and + buttons.
3. **Link concepts.** Every question is tied to a dictionary entry (a "concept"), so the answer is saved with a
   meaning the whole EMR understands.
4. **Add rules**, for example "show this question only when Smoker is Yes".
5. **Check.** Form Studio lists what must be fixed and what is worth a look.
6. **Export.** You download a zip of files, and a reviewer adds them to the content repository. Nothing goes to a
   live EMR from Form Studio.

## What a concept is, and why every question needs one

A **concept** is a dictionary entry with a fixed meaning, such as "Pulse" or "Yes". Every question and every
answer option points at one. That way, data from all forms and all facilities can be counted together: "Pulse"
in a triage form and "Pulse" in a ward form are the same thing in reports.

## The Visit Details page (always the first page of every form)

**Visit Details** is the standard first page of every EthioEMR form: visit date, provider and the other standard
fields. It is always there and can't be removed or changed, because every facility relies on it.

## A form's identity, and why it is locked for shipped forms

A form's **identity** is its name, its uuid (a long unique code), its encounter type and its version. For a form
that already ships, the identity is **locked**, because facilities' saved data depends on it.

## Other words used in Form Studio

- **Form:** the screen a clinician fills in during a visit.
- **Page, section and question:** a form has pages, a page has sections, and a section has questions.
- **Encounter type:** the kind of visit the form belongs to (for example Consultation, Triage or Vitals). Only the project's
  existing types are offered.
- **Content repository:** the shared, reviewed folder of forms and concepts that every facility's EMR is built
  from.
- **Repeating group:** questions that can be filled in more than once, such as each medicine with its dose.
