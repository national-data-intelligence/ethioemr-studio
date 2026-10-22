// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/components/interactive-builder/modals/question/question-form/question-types/question-type.component.tsx
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import React from 'react';
import {
  ObsTypeQuestion,
  ProgramStateTypeQuestion,
  PatientIdentifierTypeQuestion,
  TestOrderTypeQuestion,
  PersonAttributeTypeQuestion,
} from './inputs';
import { useFormField } from '../../form-field-context';
import type { QuestionType } from '../../../../../../types';

const componentMap: Partial<Record<QuestionType, React.FC>> = {
  obs: ObsTypeQuestion,
  programState: ProgramStateTypeQuestion,
  patientIdentifier: PatientIdentifierTypeQuestion,
  obsGroup: ObsTypeQuestion,
  testOrder: TestOrderTypeQuestion,
  personAttribute: PersonAttributeTypeQuestion,
};

const QuestionTypeComponent: React.FC = () => {
  const { formField } = useFormField();

  const Component = componentMap[formField.type as QuestionType];
  if (!Component) {
    console.error(`No component found for questiontype: ${formField.type}`);
    return null;
  }
  return <Component />;
};

export default QuestionTypeComponent;
