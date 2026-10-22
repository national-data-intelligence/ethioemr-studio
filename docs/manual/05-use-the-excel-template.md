---
title: "Use the Excel template: turn a paper or Word form into an EMR form"
audience: form builders
---
# Use the Excel template: turn a paper or Word form into an EMR form

Most new forms start on paper or in Word. Copy them into our Excel template, one row per question, and Form Studio
builds the form.

1. Choose **From an Excel template** and press **Download the empty template**. You can also press **Download a
   filled example (Cardiac History Sheet)** to copy from.
2. Fill in the **About** sheet once: form name, encounter type and description. Fill in "Replaces" only if you
   are rebuilding a form that already ships.
3. Fill in the **Questions** sheet, one row per question. **Red headers must be filled in; blue ones are
   optional.**
4. Upload the file on the same page, then follow [Convert a Bahmni export](04-convert-a-bahmni-export.md) from
   step 3. The review screen is the same.

## Excel template columns and question types

The question types are: text, long text, number, date, date-time, time, yes/no, one of, many of, dropdown,
calculated, note.

| Column | What to write |
|---|---|
| Page, Section | Their titles. Leave blank to keep the one above. |
| Question | The question as the clinician reads it. |
| Type | One of: text, long text, number, date, date-time, time, yes/no, one of, many of, dropdown, calculated, note. The cell offers the list. |
| Options | For one of, many of or dropdown: the answers, separated by `;`, for example `Supine; Sitting`. |
| Required | `yes` if it must be filled in. |
| Unit, Min, Max, Whole number | For numbers, for example `mmHg`. |
| Warn below, Warn above | A yellow "please check" warning. The form can still be saved. |
| Show if | When the question appears. See below. |
| Calculation | For calculated: `BMI(<height ID>, <weight ID>)` or `EDD(<last period ID>)`. |
| Group, Repeat | Rows with the same Group are saved together, for example systolic and diastolic. `yes` in Repeat gives the group an "Add" button. |
| Question ID | A short name for the question. Needed only when another row's Show if points at it. |
| Concept | Optional. Leave it blank and Form Studio searches the dictionary. |
| From EMR | `yes` for things the EMR already has (name, MRN, age, sex). These aren't built. |
| Notes | Anything for the reviewer. Not built into the form. |

## Show if in the Excel template: the words to use

- `smoker = Yes`: show when the "smoker" question is Yes.
- `symptoms has Fever`: for tick-box (many of) questions.
- `pulse is answered`, or `pulse is empty`.
- `age < 5`, `age > 18`, `sex = F`.

Use the Question ID and the option exactly as they're written in their rows.

## How many forms the Excel template can carry

All 17 Word forms of the St. Petros batch (1,321 questions) fit the template with no lost
rows.
