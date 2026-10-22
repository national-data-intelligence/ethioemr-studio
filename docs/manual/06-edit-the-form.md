---
title: Edit the form on screen
audience: form builders
---
# Edit the form on screen

The editor has two halves.

- **Left:** your working view. Switch at the top between **Preview & edit**, **Rules** and **Schema editor**.
- **Right:** the live engine preview (exactly what the clinician will see), and the Form Studio panel with the
  identity, the Check and the downloads.

## Preview & edit: the buttons on pages, sections and questions

You see the form with buttons on every page, section and question:

| Button | What it does |
|---|---|
| Pencil (Edit page, Edit section, Edit question) | Change the label, type, options, concept, or whether it is required |
| Bin (Delete page, Delete section, Delete question) | Remove it |
| **Add page**, **Add section**, **Add question** | Add a new one in that place |
| **Add repeating group** | Add a group of questions that can be filled in several times, like medicines |
| **Add a question to this group** | Add one more question inside a group |
| Rules button | Opens [the rules](08-rules.md) for that question |

A red **"Concept not mapped"** tag means the question isn't linked to a dictionary concept yet. See
[Concepts](07-concepts.md).

## The Rules view: every rule of the form as a sentence

This lists every question that has a rule, written as a sentence, for example *Shown only when "Smoker" is
"Yes".* Press **Edit rules** to change one.

## The Schema editor: the form as JSON text

The form as JSON text, for experienced users. Changes made here show on the right when rendered.

For forms that already ship, **Visit Details** and the identity (name, uuid, encounter type, version) can't be
changed.
