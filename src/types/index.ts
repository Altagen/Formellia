export type RequestType =
  | "contentieux_fiscal"
  | "recours_administratif"
  | "autre";

export type SubmissionStatus = "pending" | "in_progress" | "done" | "waiting_user";
export type SubmissionPriority = "none" | "yellow" | "orange" | "red" | "green";

export interface FormStep1Data {
  requestType: RequestType;
}

export interface ContentieuxFiscalData {
  requestType: "contentieux_fiscal";
  dateControle: string;
  montantLitige: string;
  organisme: string;
}

export interface RecoursAdministratifData {
  requestType: "recours_administratif";
  administrationConcernee: string;
  dateDecision: string;
  objetRecours: string;
}

export interface AutreData {
  requestType: "autre";
  description: string;
}

export type StepFormData =
  | ContentieuxFiscalData
  | RecoursAdministratifData
  | AutreData;

export interface WizardState {
  step: number;
  requestType: RequestType | null;
  stepData: Partial<StepFormData>;
  email: string;
  receivedAt: string;
  dueDate: string;
}
