---
title: Convert a Bahmni export
audience: form builders
---
# Convert a Bahmni export

Use this when the form already exists in Bahmni (the older system).

1. In Bahmni, export the form. You get a **.zip** file.
2. In Form Studio, choose **From a Bahmni export**, then drag the zip onto the page (or click to choose it).
3. Form Studio reads the file and shows **"Matching concepts on this server"**, with a counter, while it looks up
   each question in this EMR's dictionary.
4. You see **"What came out"**:
   - the counts: pages, sections, questions, **concepts matched** and **concepts to pick**;
   - **Needs a decision in the editor:** things a person must choose, such as a question with no matching
     concept;
   - **For information:** what was changed on purpose, such as Bahmni chart blocks that O3 doesn't use;
   - **Not built (from EMR):** questions the EMR already knows, like the patient's name or age;
   - **Rows that could not be used**, each with the reason.
5. Check the form name, description and encounter type at the top. If this rebuilds a form that already ships,
   Form Studio says **Rebuilds "<name>"** and keeps that form's uuid, so facilities' data stays linked.
6. Press **Open in the editor**.

## How Bahmni's parts become O3 parts

- A Bahmni **section** becomes a page or a section.
- A Bahmni **set that can be added more than once** ("allowAddMore") becomes a **repeating group**.
- **Required** and **multi-select** settings come across. A starred flag in Bahmni means the same thing here.
- **Computed** fields become calculated questions. Check their formula in Rules.
- **Concepts:** Form Studio reuses the concept this EMR already uses. It never copies Bahmni's own codes, because
  they don't exist here.
