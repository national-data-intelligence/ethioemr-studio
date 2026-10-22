// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useProgramStates.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type ProgramWorkflowState } from '@openmrs/esm-form-engine-lib';
import type { Program, ProgramWorkflow } from '../types';

export function usePrograms() {
  const customRepresentation = 'custom:(uuid,name,retired,allWorkflows)';
  const url = `${restBaseUrl}/program?v=${customRepresentation}`;

  const { data, error, isLoading } = useSWR<{ data: { results: Array<Program> } }, Error>(url, openmrsFetch);

  return {
    programs: data ? data?.data?.results : [],
    programsLookupError: error,
    isLoadingPrograms: isLoading,
  };
}

export function useProgramWorkStates(workflowUuid: string) {
  const customRepresentation = 'custom:(uuid,retired,states,concept:(uuid,display))';
  const url = `${restBaseUrl}/workflow/${workflowUuid}?v=${customRepresentation}`;

  const { data, error, isLoading, mutate } = useSWR<{ data: ProgramWorkflow }, Error>(
    workflowUuid ? url : null,
    openmrsFetch,
  );

  return {
    programStates: data?.data?.states ?? [],
    programStatesLookupError: error,
    isLoadingProgramStates: isLoading,
    mutateProgramStates: mutate,
  };
}
