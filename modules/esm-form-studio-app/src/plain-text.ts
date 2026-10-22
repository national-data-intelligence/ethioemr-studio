/**
 * For t() calls that put a user's text into a sentence (a question label, a file or form name, a hand-written rule).
 * React already makes text safe on screen; i18next's own escaping on top turns "/" into "&#x2F;" and "<" into "&lt;".
 * Usage: t('rulesFor', 'Rules for "{{label}}"', { label, ...plainText })
 */
export const plainText = { interpolation: { escapeValue: false } } as const;
