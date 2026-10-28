"""Write and fix form code: the model drafts, check-form decides.

POST /v1/forms/draft, as agreed with the AI service team (note to Bini, 2026-10-22, section 3). This file does the
task "draft-rule": one show or hide rule, calculation, warning or hard limit for one question of the form it is given.

  1. The model reads the form's questions (ids, labels, answer uuids) and the builder's instruction, and replies in a
     fixed JSON shape: behaviour, expression, a one-line explanation.
  2. check-form --rules-only checks the expression against the same questions: it must compile, name only questions
     that exist, and compare coded questions with answer uuids, never words.
  3. If the Check finds errors, the model gets one more try with the findings. A draft that still has errors is
     never returned: the caller gets the findings instead.
The draft is a suggestion. A person applies it in Form Studio, where the same Check runs again.
"""
import json
import os
import re
import subprocess

CHECK_FORM = os.environ.get("FA_CHECK_FORM", "/srv/check-form/check-form.js")

# Where each behaviour is stored on an O3 question.
FIELD = {"hide": "hide.hideWhenExpression", "calculate": "questionOptions.calculate.calculateExpression",
         "warn": "validators[].warnsWhenExpression", "fail": "validators[].failsWhenExpression"}

RULE_SCHEMA = {"type": "object", "required": ["behaviour", "expression", "explanation"], "properties": {
    "behaviour": {"enum": ["hide", "calculate", "warn", "fail"]},
    "expression": {"type": "string"},
    "explanation": {"type": "string"}}}

RULE_SYSTEM = """You write rules for OpenMRS O3 clinical forms (the form engine's JavaScript expressions).
The builder says what they want in plain words. You reply with one rule for the target question:
- "behaviour": hide (when the question is hidden), calculate (fills the question in by itself), warn (yellow
  warning, the form still saves) or fail (red error, the form will not save).
- "expression": the expression. Use only the question ids listed, and these names:
  myValue (the target question's own value; use it in warn and fail), sex ('M' or 'F'), age (whole years),
  isEmpty(x), today(), calcBMI(heightId, weightId), calcEDD(lmpId).
- "explanation": one plain sentence saying what the rule does.

How the engine reads each behaviour:
- hide: the expression is TRUE when the question must be HIDDEN. "Show only when X" means hide when not X.
- warn / fail: the expression is TRUE when the value is wrong. Start with `myValue && (...)` so an empty answer
  never warns.
- calculate: the expression returns the value.

Write rules in the style the shipped forms use, so Form Studio's Rules window can edit them:
- coded answer, show only when "Yes":  isEmpty(pregnant) || pregnant !== '<uuid of Yes>'
- coded answer, show only when one of two answers:  isEmpty(q) || (q !== '<uuid A>' && q !== '<uuid B>')
- tick boxes, show only when "Other" is ticked:  !(symptoms && symptoms.includes('<uuid of Other>'))
- show only for women:  sex !== 'F'
- two conditions together, show only for adults who answered "Yes":  age < 18 || isEmpty(q) || q !== '<uuid of Yes>'
  (add a condition only when the instruction asks for it)
- show only for people 18 or older:  age < 18
- show only for children under 5:  age >= 5
- warn below 60 or above 100:  myValue && (myValue < 60 || myValue > 100)
- refuse above 45:  myValue && myValue > 45
- whole numbers only (fail):  !isEmpty(myValue) && !/^-?\\d+$/.test(''+myValue)
- BMI from height and weight:  calcBMI(height, weight)
When a coded question is part of the condition, keep its isEmpty(...) guard, so the question stays hidden until
that one is answered.
Never compare a coded question with a word ('yes', 'Other'): always with the answer's uuid exactly as listed.
Combine conditions with || and && and brackets. Never invent question ids or uuids."""


class BadRequest(Exception):
    """The request cannot be drafted as sent (the caller's mistake, not the model's)."""


class CheckNotRun(Exception):
    """check-form did not run. Never treat this as a pass."""


def run_check(args, payload):
    try:
        r = subprocess.run(["node", CHECK_FORM, *args, "--stdin"], input=json.dumps(payload), capture_output=True,
                           text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise CheckNotRun(str(e))
    if r.returncode != 0 or not r.stdout.strip():
        raise CheckNotRun("check-form exit %s: %s" % (r.returncode, r.stderr.strip()[:300]))
    return json.loads(r.stdout)


def form_questions(form):
    """Every question of an O3 form, in order, as the Check's rules-only input wants them."""
    out = []

    def walk(qs):
        for q in qs or []:
            opts = q.get("questionOptions") or {}
            if q.get("id"):
                item = {"id": q["id"], "label": q.get("label", ""), "rendering": opts.get("rendering", "")}
                answers = [{"uuid": a["concept"], "label": a.get("label", "")} for a in opts.get("answers") or []
                           if a.get("concept")]
                if answers:
                    item["answers"] = answers
                out.append(item)
            walk(q.get("questions"))

    for page in form.get("pages") or []:
        for section in page.get("sections") or []:
            walk(section.get("questions"))
    return out


def own_value(expression, target_id, behaviour):
    """In a warning or a hard limit the question's own value is myValue, the name Form Studio's Rules window reads.
    The model sometimes writes the question's id instead; both mean the same value, so code puts myValue back."""
    if behaviour not in ("warn", "fail"):
        return expression
    return re.sub(r"(?<![\w.'$])%s(?![\w'])" % re.escape(target_id), "myValue", expression)


def question_lines(questions):
    lines = []
    for q in questions:
        line = '- %s: "%s" (%s)' % (q["id"], q["label"], q["rendering"] or "text")
        if q.get("answers"):
            line += " answers: " + ", ".join('"%s" = \'%s\'' % (a["label"], a["uuid"]) for a in q["answers"])
        lines.append(line)
    return "\n".join(lines)


# Words in the instruction that point to one behaviour. Only a hint: the model still decides.
HINTS = (("warn", r"\b(warn|warning|flag|alert|caution)"),
         ("fail", r"\b(can'?t|cannot|must|not allow|don'?t allow|refuse|mistake|invalid)"),
         ("calculate", r"\b(calculate|work out|compute|fill in by itself|automatically)"),
         ("hide", r"\b(show|hide|only (for|when|if|ask)|ask (this|only|about)|appear)"))


def behaviour_hint(instruction):
    found = [b for b, rx in HINTS if re.search(rx, instruction, re.I)]
    return found[0] if len(found) == 1 else None


def rule_prompt(instruction, target, questions, behaviour, findings=None, previous=None):
    user = ("Form questions:\n%s\n\nTarget question: %s (\"%s\")\nInstruction: %s"
            % (question_lines(questions), target["id"], target["label"], instruction))
    if behaviour:
        user += "\nThe behaviour must be: %s" % behaviour
    elif behaviour_hint(instruction):
        user += "\nThe builder's words suggest the behaviour: %s" % behaviour_hint(instruction)
    if findings:
        user += ("\n\nYour previous expression was:\n%s\nThe form Check rejected it:\n%s\nWrite a corrected rule."
                 % (previous, "\n".join("- " + f["message"] for f in findings)))
    return user


async def draft_rule(req, llm_json):
    """Returns (draft, check, attempts) or raises DraftFailed(check) when the Check never comes back clean."""
    questions = form_questions(req.form)
    target = next((q for q in questions if q["id"] == req.targetQuestionId), None)
    if target is None:
        raise BadRequest("targetQuestionId %r is not a question in this form" % req.targetQuestionId)
    findings = previous = check = reply = None
    for attempt in (1, 2):
        reply = await llm_json(RULE_SYSTEM, rule_prompt(req.instruction, target, questions, req.behaviour, findings,
                                                         previous), RULE_SCHEMA)
        behaviour = req.behaviour or reply["behaviour"]
        expression = own_value(reply["expression"].strip(), target["id"], behaviour)
        check = run_check(["--rules-only"], {"expression": expression, "behaviour": behaviour,
                                             "targetQuestionId": target["id"], "questions": questions})
        if check["status"] != "errors":
            rule = check.get("rule") or {}
            draft = {"kind": "rule", "targetQuestionId": target["id"], "behaviour": behaviour,
                     "field": FIELD[behaviour], "expression": expression,
                     "plainLanguage": rule.get("plainLanguage") or reply["explanation"],
                     "editableInRulesWindow": bool(rule.get("simple")),
                     "referencedQuestions": rule.get("referencedQuestions", [])}
            return draft, check, attempt
        findings, previous = [f for f in check["findings"] if f["severity"] == "error"], expression
    raise DraftFailed(check, previous)


class DraftFailed(Exception):
    def __init__(self, check, expression):
        super().__init__("draft_failed_check")
        self.check, self.expression = check, expression
