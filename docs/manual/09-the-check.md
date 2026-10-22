---
title: The Check
audience: form builders
---
# The Check

The **Check** in the right-hand panel reads the whole form and lists problems in two groups:

- **Must fix before export:** things that would break saving or reports. Examples: a question with no concept, a
  concept or answer that doesn't exist on this EMR, two questions with the same ID, a rule that names a question
  that no longer exists, a drug form used as a question.
- **Worth a look:** things that work but are probably mistakes. Examples: a retired concept, a group whose concept
  isn't a set, a concept of an unusual class for a question, a concept still waiting to be created, a setting the
  Form Builder's schema doesn't expect.

Press **Check concepts on the server** to also confirm that every concept exists in this EMR. A counter shows the
progress, and when it finishes the panel says **Concepts checked**.

Press **Check again** after you fix things.

Downloading stays blocked, with the reason shown, until:

- the identity is right,
- there are no errors, and
- the concepts have been checked.

Of the 368 shipped forms, 357 pass with no errors. The errors found in the other 11 are real defects.
