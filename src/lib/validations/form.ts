import { z } from "zod";

export const requestTypeSchema = z.enum([
  "contentieux_fiscal",
  "recours_administratif",
  "autre",
]);

export const contentieuxFiscalSchema = z.object({
  requestType: z.literal("contentieux_fiscal"),
  dateControle: z.string().min(1, "Date required"),
  montantLitige: z.string().min(1, "Amount required"),
  organisme: z.string().min(1, "Organisation required"),
});

export const recoursAdministratifSchema = z.object({
  requestType: z.literal("recours_administratif"),
  administrationConcernee: z.string().min(1, "Administration required"),
  dateDecision: z.string().min(1, "Decision date required"),
  objetRecours: z.string().min(1, "Appeal subject required"),
});

export const autreSchema = z.object({
  requestType: z.literal("autre"),
  description: z.string().min(10, "Description required (min 10 characters)"),
});

export const formDataSchema = z.discriminatedUnion("requestType", [
  contentieuxFiscalSchema,
  recoursAdministratifSchema,
  autreSchema,
]);

export const submissionSchema = z.object({
  email: z.string().email("Invalid email"),
  formData: formDataSchema,
  receivedAt: z.string().optional(),
  dueDate: z.string().optional(),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type FormData = z.infer<typeof formDataSchema>;
export type RequestType = z.infer<typeof requestTypeSchema>;
