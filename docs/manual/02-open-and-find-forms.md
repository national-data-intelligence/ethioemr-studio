---
title: Open Form Studio and find a form
audience: form builders
---
# Open Form Studio and find a form

1. Open the EMR in the browser and log in. On the team's test machine the address is
   `http://localhost:18200/openmrs/spa`.
2. Open the grid menu at the top right and choose **Form Studio**, or go straight to `http://localhost:18200/openmrs/spa/form-studio`.

## The Form Studio start page: create a new form or find an existing one

- **Left: "Create a new form".** Three cards: **From scratch**, **From a Bahmni export** and **From an Excel
  template**. Each has its own page in this manual.
- **Right: "Forms".** Every form on this EMR, listed as in the Form Builder.
  - **Search this list:** type part of a name, for example "triage".
  - **Filter by:** Active (the default), All, Published, Unpublished or Retired.
  - On each row, **Edit schema** opens the form in the editor and **Download schema** saves its file.
- **Open the concept dictionary:** look up concepts without opening a form.

When you open an existing form, its identity stays locked. You can change what's in it, but not its name, uuid or
encounter type.
