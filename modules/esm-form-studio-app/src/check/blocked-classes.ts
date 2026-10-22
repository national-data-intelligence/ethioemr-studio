/**
 * Concept classes that may never be used as a question (diagnoses, drugs and sets save badly or not at all): the default of the setting
 * blockedQuestionConceptClasses, and what the command-line Check uses. Kept in its own small file so the app's
 * settings don't load the whole Check.
 */
export const DEFAULT_BLOCKED_CLASSES = ['Diagnosis', 'Drug', 'Drug form', 'Medicament', 'ConvSet', 'LabSet', 'MedSet'];
