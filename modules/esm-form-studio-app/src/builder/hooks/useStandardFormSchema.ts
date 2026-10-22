// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useStandardFormSchema.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
// FORM STUDIO: bundled copy of https://json.openmrs.org/form.schema.json (the distro's CSP blocks the fetch,
// and facilities may be offline). Refresh it with: curl -s <that url> -o src/form-model/form.schema.json
import standardFormSchema from '../../form-model/form.schema.json';

export function useStandardFormSchema() {
  return {
    schema: standardFormSchema,
    schemaProperties: standardFormSchema.properties,
    error: undefined as Error | undefined,
    isLoading: false,
  };
}
