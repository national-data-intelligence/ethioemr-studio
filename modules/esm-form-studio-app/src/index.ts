/**
 * Entry point: tells the O3 app shell what this module provides. Every name exported here is referenced by
 * `routes.json` (pages and extensions), which is where the shell learns *where* each one appears.
 */
import { defineConfigSchema, getAsyncLifecycle, getSyncLifecycle } from '@openmrs/esm-framework';
import { configSchema } from './config-schema';
import FormStudioNavTile from './links/form-studio-nav-tile.component';
import ConceptDictionaryNavTile from './links/concept-dictionary-nav-tile.component';

export const moduleName = '@palladium-ethiopia/esm-form-studio-app';

const options = {
  featureName: 'form-studio',
  moduleName,
};

export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
}

/** The Form Studio page, at /openmrs/spa/form-studio (see `pages` in routes.json). */
export const root = getAsyncLifecycle(() => import('./root.component'), options);

/**
 * Tile in the top-right grid menu (slot `navbar-items-slot`, rendered by KenyaEMR's navbar overlay), beside
 * Legacy Admin and ETL Administration. Shown only to users with the Form Builder's privilege (routes.json).
 */
export const formStudioNavTile = getSyncLifecycle(FormStudioNavTile, options);

/** Concept dictionary tile in the same grid menu; opens /form-studio/dictionary. */
export const conceptDictionaryNavTile = getSyncLifecycle(ConceptDictionaryNavTile, options);

/**
 * The Form Builder's builder modals (copied into src/builder/, renamed form-studio-... so they never collide with the
 * Form Builder's own). Opened with showModal('form-studio-...').
 */
export const formStudioNewFormModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/new-form/new-form.modal'),
  options,
);
export const formStudioNewPageModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/new-page/page.modal'),
  options,
);
export const formStudioDeletePageModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/delete-page/delete-page.modal'),
  options,
);
export const formStudioNewSectionModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/section/section.modal'),
  options,
);
export const formStudioDeleteSectionModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/delete-section/delete-section.modal'),
  options,
);
export const formStudioAddFormReferenceModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/add-form-reference/add-form-reference.modal'),
  options,
);
export const formStudioQuestionModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/question/question.modal'),
  options,
);
export const formStudioDeleteQuestionModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/delete-question/delete-question.modal'),
  options,
);
export const formStudioRestoreDraftSchemaModal = getAsyncLifecycle(
  () => import('./builder/components/interactive-builder/modals/restore-draft-schema/restore-draft-schema.modal'),
  options,
);
export const formStudioEditTranslationModal = getAsyncLifecycle(
  () => import('./builder/components/translation-builder/edit-translation.modal'),
  options,
);

// Form Studio's own dialogs
export const formStudioFormMetadataModal = getAsyncLifecycle(() => import('./editor/form-metadata.modal'), options);
export const formStudioPageLabelModal = getAsyncLifecycle(() => import('./editor/page-label.modal'), options);
export const formStudioNewConceptsModal = getAsyncLifecycle(() => import('./export/new-concepts.modal'), options);
export const formStudioQuestionRulesModal = getAsyncLifecycle(() => import('./logic/question-rules.modal'), options);
