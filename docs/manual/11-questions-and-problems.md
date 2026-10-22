---
title: Questions and problems
audience: form builders
---
# Questions and problems

Common problems in Form Studio and what to do about each one.

## I can't type in a box in Form Studio

A message at the top right may be holding the keyboard. Close it and try again.

## The browser asks "Leave site?" while I edit a form

The editor has unsaved changes. Choose **Cancel** to stay on the page. If you need the work, download it first.

## Form Studio sent me back to the login page

Your session ended, so log in again. Download your work often, so nothing is lost.

## A question shows the red "Concept not mapped" tag

The question isn't linked to a dictionary concept yet. Open the question's pencil and pick a concept (see the
manual page "Concepts: pick or create").

## The concept search doesn't find a concept I know exists

Open the concept dictionary once and let it finish reading this EMR's database (about 25 minutes, only the first
time). After that, search looks at every concept. Until then, typing the concept's exact full name always finds it.

## "This EMR's concept search is incomplete"

The server's own search index is out of date, so it misses many concepts, often all the CIEL ones. Form Studio
reads the whole dictionary from the database instead, so let the concept dictionary finish reading. Don't create a
new concept just because a search came back short. An administrator can also rebuild the server's index (Legacy
Admin > Maintenance > Search Index).

## Why is the Download content files button greyed out?

The panel on the right says why. There are three possible reasons:
- the form's identity needs fixing;
- the Check found errors;
- the concepts haven't been checked on the server yet: press **Check concepts on the server**.

## My Excel file is refused when I upload it

Use the downloaded template, and don't rename its sheets (About, Questions, Options) or its column headers. Each
refused row is listed with the reason.

## A Show if rule from the Excel template didn't work

The rule must use the other row's **Question ID**, with the option written exactly as it is in that row. The review
screen lists any rules it couldn't read.

## Can I change the name or uuid of a form that facilities already use?

No. A shipped form's name, uuid, encounter type and version are locked, because facilities' saved data is linked to
them. Make a new form instead, or ask the content owner.
