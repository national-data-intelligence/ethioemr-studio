---
title: "Concepts: pick or create"
audience: form builders
---
# Concepts: pick or create

Every question and every answer needs a **concept**: a dictionary entry with a fixed meaning. Correct concepts are
what let reports count the same thing across forms and facilities.

## The concept dictionary shows every concept in this EMR

The **concept dictionary** (start page > **Open the concept dictionary**) reads every concept from this EMR's
database: names, synonyms and other names, class, datatype, and how many shipped forms use each.
- **The first time** it takes about 25 minutes, with a progress bar. You can keep working meanwhile, and if the page is
  reloaded it carries on where it stopped.
- **After that** it opens at once. Press **Refresh** to read the database again.

The question dialog's concept search uses the same full copy once it's ready, so it doesn't miss concepts.

## Check whether a concept already exists, and pick it (always first)

1. Open the question's **pencil** and search by the question's name.
2. The results are **ranked**. Concepts already used in other forms come first, marked **"used in N forms"**.
   Concepts that don't fit are marked with the reason, for example a drug used as a question, or a name that's
   too general ("NA", "Other").
3. Choose the one that means exactly what the question asks.

## Create a new concept, only when nothing fits

In the right-hand panel, **Create new concepts (N unmatched)** lists the questions and answers that still have no
concept. For each one, Form Studio proposes:

| Kind | Made as |
|---|---|
| An answer option | Finding |
| A Yes/No question | Question with Yes/No answers (the shared Yes and No concepts) |
| A measurement | Question, Numeric, with units, lowest and highest possible values, and decimals allowed |
| Other questions | Question, of the matching type |

Check each name (Form Studio warns you if it already exists), then press **Create N concepts**. The concepts are
added to the export files, not to a server.

## Concepts you must never create: drugs, diagnoses and groups

- **Drugs.** They are owned by the pharmacy team.
- **Diagnoses (ICD-11).** They come from the national list.
- **Groups.** A group of questions needs an existing **set** concept (concept class ConvSet or another set). Pick one
  with the group's pencil.
