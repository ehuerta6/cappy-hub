import type { ZodError } from "zod";

export type FormFieldErrors = Record<string, string>;
export type FormValues = Record<string, string | string[]>;

export type FormActionState = {
  error: string;
  success: string;
  fieldErrors?: FormFieldErrors;
  values?: FormValues;
};

export const initialFormActionState: FormActionState = {
  error: "",
  success: "",
};

export function submittedFormValues(
  formData: FormData,
  fields: readonly string[],
  multipleFields: readonly string[] = [],
): FormValues {
  const multiple = new Set(multipleFields);
  return Object.fromEntries(
    fields.map((field) => {
      const values = formData
        .getAll(field)
        .filter((value): value is string => typeof value === "string");
      return [field, multiple.has(field) ? values : (values[0] ?? "")];
    }),
  );
}

export function formFailure(
  message: string,
  formData?: FormData,
  fields: readonly string[] = [],
  fieldErrors?: FormFieldErrors,
  multipleFields: readonly string[] = [],
): FormActionState {
  const meaningfulFieldErrors =
    fieldErrors && Object.keys(fieldErrors).length ? fieldErrors : undefined;
  return {
    error: message,
    success: "",
    ...(formData && fields.length
      ? { values: submittedFormValues(formData, fields, multipleFields) }
      : {}),
    ...(meaningfulFieldErrors ? { fieldErrors: meaningfulFieldErrors } : {}),
  };
}

export function fieldErrorsFromZod(
  error: ZodError,
  fields: readonly string[],
): FormFieldErrors {
  const allowed = new Set(fields);
  const fieldErrors: FormFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      typeof field === "string" &&
      allowed.has(field) &&
      fieldErrors[field] === undefined
    ) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

export function validationFailure(
  error: ZodError,
  formData: FormData,
  fields: readonly string[],
  multipleFields: readonly string[] = [],
): FormActionState {
  return formFailure(
    error.issues[0]?.message ?? "Review the submitted fields",
    formData,
    fields,
    fieldErrorsFromZod(error, fields),
    multipleFields,
  );
}

export function submittedValue(
  values: FormValues | undefined,
  field: string,
  fallback = "",
): string {
  const value = values?.[field];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function submittedValues(
  values: FormValues | undefined,
  field: string,
  fallback: string[] = [],
): string[] {
  const value = values?.[field];
  if (Array.isArray(value)) return value;
  return value ? [value] : fallback;
}
