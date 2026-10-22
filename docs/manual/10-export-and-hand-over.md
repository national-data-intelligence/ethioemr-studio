---
title: Export and hand over
audience: form builders
---
# Export and hand over

When the Check is clean, press **Download content files** in the right-hand panel. You get
`<Form_name>-content.zip`, which contains:

- `README.md`: the steps for the reviewer, written for this form;
- the form file, in `ampathforms/`;
- if you created concepts, the rows to add to the concept list (`master_new_concepts.APPEND.csv`) and, for
  numbers, their settings (`zz_numeric_precision_fixes.APPEND.csv`).

**Form JSON only** downloads just the form file.

## Concepts this EMR doesn't have

After **Check concepts on the server**, any concept the form uses that this EMR doesn't have shows as an error.
**Create new concepts** then proposes it with its existing code, so the form stays as it is. The download adds the
concept for the reviewer. Missing CIEL concepts are listed separately: ask the dictionary owner to load them.
Form Studio never creates CIEL concepts.

## What happens after you download the content files

1. The files are added to the content repository on a `form-updates` branch, as the README says.
2. Content checks and one real save test run on a test EMR.
3. A pull request is reviewed and merged, and a new build brings the form to facilities.

Form Studio didn't save anything to any EMR. That's on purpose: every form is reviewed first.
