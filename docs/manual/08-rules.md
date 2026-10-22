---
title: "Rules: when questions appear, warnings, calculations"
audience: form builders
---
# Rules: when questions appear, warnings, calculations

Press a question's **Rules** button. The window **Rules for "<question>"** has four parts, each with a short help
line. Press **Save rules** when done: the **Rules** view and the question itself then show the rule as a sentence.

## Show a question only when another answer is given (show if)

In **When should this question appear?**, choose **Always** or **Only when…**, then one or more conditions:
- another question's answer (**Any of these answers**), e.g. show "Cigarettes per day" only when Smoker is Yes;
- whether another question has an answer;
- a number comparison;
- **Patient's age** or **Patient's sex**.

With more than one condition, choose **All of them must be true** or **Any one of them is enough**. A hidden
question starts hidden and appears once the condition is met.

## Warn if a value is unusual (a warning is not the same as required)

**Warn below** and **Warn above** show a yellow warning so the clinician double-checks the value. The form can
still be saved.

**Required** is different: it is set in the question's pencil, and the form can't be saved until the question
is answered.

## Number format: whole numbers or decimals

Choose **Any number**, **Whole numbers only**, **Up to 1 decimal** or **Up to 2 decimals**. The form won't save a
value with more decimals than this.

## Fill in by itself: BMI and expected delivery date are worked out automatically

- **Typed in (not worked out)**: the normal case.
- **BMI from height (cm) and weight (kg)**: choose the height and weight questions. BMI then fills in by itself.
- **Expected delivery date from the last period (LNMP)**: choose the LNMP question.

A value that is worked out from other answers can't be typed in.

## Rules "written by hand" in older forms

Some older forms have rules too complex for these choices. The window says **"This rule was written by hand."**
The rule keeps working and is left as it is, unless you press **Replace it with a simple rule**.

The simple rules were tested against the rules in the shipped forms and behave exactly like them (648 show and
hide rules, 457 warnings).
