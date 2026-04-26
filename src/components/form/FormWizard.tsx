"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { FormStep } from "./FormStep";
import { DynamicField } from "./DynamicField";
import { Button } from "@/components/ui/button";
import { evaluateVisibleWhen } from "@/lib/config/visibleWhen";
import { injectComputedValues } from "@/lib/config/formula";
import type { FieldDef } from "@/types/config";
import type { FormInstanceConfig } from "@/types/formInstance";
import type { PrintTemplate, PrintCondition } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { buildInterpolationVars } from "@/lib/print/interpolate";
import { getTranslations, t } from "@/i18n";
import { PrintPreview } from "./print/PrintPreview";

interface FormWizardProps {
  instanceConfig: FormInstanceConfig;
  /** Submit URL — defaults to /api/submit for backward compat */
  submitUrl?: string;
  /** Global system locale — used when no per-form locale is set */
  locale?: string;
}

type FieldValues = Record<string, string>;
type FieldErrors = Record<string, string>;

type ActionPhase =
  | { status: "idle" }
  | { status: "running"; actionIndex: number; total: number }
  | { status: "print"; template: PrintTemplate; vars: PrintInterpolationVars; dbSaved: boolean; filenameTemplate?: string; brandColor?: string }
  | { status: "success"; dbSaved: boolean }
  | { status: "error"; message: string };

function evaluateRunIf(condition: PrintCondition, fieldValues: Record<string, string>): boolean {
  const value = fieldValues[condition.fieldId] ?? "";
  switch (condition.operator) {
    case "eq":        return value === (condition.value ?? "");
    case "neq":       return value !== (condition.value ?? "");
    case "empty":     return value === "";
    case "not_empty": return value !== "";
    default:          return false; // unknown operator → skip action (safe-fail, consistent with PrintBody)
  }
}

export function FormWizard({ instanceConfig, submitUrl = "/api/submit", locale }: FormWizardProps) {
  const { steps } = instanceConfig.form;
  const totalSteps = steps.length;
  const tr = getTranslations(instanceConfig.meta.locale ?? locale);
  const features = instanceConfig.features ?? {};

  const [step, setStep] = useState(1);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [phase, setPhase] = useState<ActionPhase>({ status: "idle" });
  const [countdown, setCountdown] = useState<number>(
    instanceConfig.successRedirectDelay ?? 5
  );
  const [activeSectionId, setActiveSectionId] = useState<string>("");

  // Derived allValues: fieldValues + evaluated computed fields (all steps)
  const allValues = useMemo(() => {
    const merged = { ...fieldValues };
    for (const s of steps) {
      injectComputedValues(s.fields, merged);
    }
    return merged;
  }, [fieldValues, steps]);

  // Analytics: generate a session ID once per mount
  const sessionIdRef = useRef<string>("");

  function sendAnalyticsEvent(stepNum: number, action: "view" | "abandon" | "complete") {
    if (!submitUrl?.includes("/api/forms/")) return;
    const slug = submitUrl.split("/api/forms/")[1]?.split("/")[0] ?? "/";
    const analyticsUrl = `/api/forms/${slug}/analytics`;
    const payload = JSON.stringify({ sessionId: sessionIdRef.current, step: stepNum, action });
    try {
      navigator.sendBeacon(analyticsUrl, new Blob([payload], { type: "application/json" }));
    } catch {
      // sendBeacon not available (SSR/test) — silently skip
    }
  }

  // Initialize session ID and send initial view event
  useEffect(() => {
    const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionIdRef.current = sid;
    if (submitUrl?.includes("/api/forms/")) {
      const slug = submitUrl.split("/api/forms/")[1]?.split("/")[0] ?? "/";
      const analyticsUrl = `/api/forms/${slug}/analytics`;
      const payload = JSON.stringify({ sessionId: sid, step: 1, action: "view" });
      try { navigator.sendBeacon(analyticsUrl, new Blob([payload], { type: "application/json" })); } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send abandon event on page hide if not yet submitted
  useEffect(() => {
    const submitted = phase.status === "success" || phase.status === "print";
    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && !submitted) {
        sendAnalyticsEvent(step, "abandon");
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [step, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect countdown — only active after successful DB submission when a redirect URL is set
  useEffect(() => {
    if (phase.status !== "success" || !instanceConfig.successRedirectUrl) return;

    const delay = instanceConfig.successRedirectDelay ?? 5;
    setCountdown(delay);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.href = instanceConfig.successRedirectUrl!;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase.status, instanceConfig.successRedirectUrl, instanceConfig.successRedirectDelay]);

  // Section nav: IntersectionObserver to track active section
  useEffect(() => {
    if (!features.sectionNav) return;
    const currentStep = steps[step - 1];
    if (!currentStep) return;
    const sectionIds = currentStep.fields
      .filter(f => f.type === "section_header")
      .map(f => f.id);
    if (sectionIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSectionId(entry.target.id.replace("section-", ""));
            break;
          }
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: 0 },
    );

    // Small delay to let DOM settle after step transition
    const tid = setTimeout(() => {
      sectionIds.forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) observer.observe(el);
      });
      // Default active = first section
      if (!activeSectionId) setActiveSectionId(sectionIds[0]);
    }, 100);

    return () => {
      clearTimeout(tid);
      observer.disconnect();
    };
  }, [step, features.sectionNav]); // eslint-disable-line react-hooks/exhaustive-deps

  function getValue(fieldId: string): string {
    return fieldValues[fieldId] ?? "";
  }

  function setValue(fieldId: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  function isFieldVisible(field: FieldDef): boolean {
    if (!field.visibleWhen) return true;
    return evaluateVisibleWhen(field.visibleWhen, allValues);
  }

  function validateCurrentStep(): FieldErrors {
    const currentStep = steps[step - 1];
    const newErrors: FieldErrors = {};

    for (const field of currentStep.fields) {
      if (field.type === "section_header" || field.type === "alert" || field.type === "computed") continue;
      if (!isFieldVisible(field)) continue;
      if (!field.required) continue;

      const val = getValue(field.id);

      if (!val || val.trim() === "") {
        newErrors[field.id] = t(tr.form.validation.required, { field: field.label });
        continue;
      }

      if (field.validation) {
        const v = field.validation;
        if (v.minLength && val.length < v.minLength) {
          newErrors[field.id] = v.message ?? t(tr.form.validation.minLength, { field: field.label, n: v.minLength });
          continue;
        }
        if (v.maxLength && val.length > v.maxLength) {
          newErrors[field.id] = v.message ?? t(tr.form.validation.maxLength, { field: field.label, n: v.maxLength });
          continue;
        }
        if (v.pattern && !new RegExp(v.pattern).test(val)) {
          newErrors[field.id] = v.message ?? t(tr.form.validation.pattern, { field: field.label });
          continue;
        }
        if (v.min !== undefined && Number(val) < v.min) {
          newErrors[field.id] = t(tr.form.validation.min, { field: field.label, n: v.min });
          continue;
        }
        if (v.max !== undefined && Number(val) > v.max) {
          newErrors[field.id] = t(tr.form.validation.max, { field: field.label, n: v.max });
          continue;
        }
      }

      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        newErrors[field.id] = tr.form.validation.email;
      }
    }

    return newErrors;
  }

  function goNext() {
    const newErrors = validateCurrentStep();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setDirection("forward");
    setStep((s) => {
      sendAnalyticsEvent(s + 1, "view");
      return s + 1;
    });
  }

  function goBack() {
    sendAnalyticsEvent(step, "abandon");
    setErrors({});
    setDirection("back");
    setStep((s) => Math.max(1, s - 1));
  }

  async function executeActions(formData: Record<string, string>, printData: Record<string, string>) {
    // Preview mode (no submitUrl): skip all network actions and show neutral success
    if (!submitUrl) {
      setPhase({ status: "success", dbSaved: false });
      return;
    }

    const enabledList = instanceConfig.onSubmitActions?.filter(a => a.enabled !== false) ?? [];
    const actions = enabledList.length > 0
      ? enabledList
      : [{ id: "default", type: "save_to_db" as const }];

    let dbSaved = false;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Evaluate runIf condition — skip action if condition is false
      if (action.runIf && !evaluateRunIf(action.runIf, printData)) continue;

      setPhase({ status: "running", actionIndex: i, total: actions.length });

      if (action.type === "save_to_db") {
        if (!submitUrl) {
          // Preview mode — skip silently
          continue;
        }
        const payload: Record<string, string> = { ...formData };
        if (instanceConfig.security?.honeypot?.enabled) {
          const fieldName =
            instanceConfig.security.honeypot.fieldName ??
            `_${instanceConfig.meta.name.toLowerCase().replace(/\s+/g, "_")}_check`;
          payload[fieldName] = "";
        }
        try {
          const res = await fetch(submitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formData: payload }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setPhase({ status: "error", message: data.error ?? tr.form.error.submit });
            return;
          }
          dbSaved = true;
          sendAnalyticsEvent(totalSteps, "complete");
        } catch {
          setPhase({ status: "error", message: tr.form.error.network });
          return;
        }
      } else if (action.type === "print_view") {
        const vars = buildInterpolationVars(printData, instanceConfig, undefined);
        setPhase({
          status: "print",
          template: action.template,
          vars,
          dbSaved,
          filenameTemplate: action.filenameTemplate,
          brandColor: instanceConfig.page?.branding?.primaryColor,
        });
        return; // terminal — PrintPreview replaces success screen
      } else if (action.type === "webhook_post") {
        console.warn("[FormPipeline] webhook_post stub V1");
      }
    }

    setPhase({ status: "success", dbSaved });
  }

  async function handleSubmit() {
    const newErrors = validateCurrentStep();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const formData: Record<string, string> = {};
    const printData: Record<string, string> = {};
    for (const s of steps) {
      for (const field of s.fields) {
        if (field.type === "section_header" || field.type === "alert") continue;
        if (!isFieldVisible(field)) continue;
        if (field.type === "computed") {
          // Computed values go to printData but not DB (derived, not user input)
          const computedVal = allValues[field.id] ?? "";
          if (computedVal !== "") printData[field.id] = computedVal;
          continue;
        }
        const val = getValue(field.id);
        if (val !== "") {
          formData[field.dbKey ?? field.id] = val; // for DB submission
          printData[field.id] = val;               // for print (always keyed by id)
        }
      }
    }

    setDirection("forward");
    await executeActions(formData, printData);
  }

  const emailField = steps
    .flatMap((s) => s.fields)
    .find((f) => f.type === "email" || f.id === "email");
  const submittedEmail = emailField ? getValue(emailField.id) : "";

  // ── Print view screen
  if (phase.status === "print") {
    const logoUrl = instanceConfig.page?.branding?.logoUrl;
    return (
      <PrintPreview
        template={phase.template}
        vars={phase.vars}
        logoUrl={logoUrl}
        brandColor={phase.brandColor}
        filenameTemplate={phase.filenameTemplate}
        printButtonLabel={tr.form.print.printButton}
        closeButtonLabel={tr.form.print.close}
        onClose={() => setPhase({ status: "success", dbSaved: phase.status === "print" ? phase.dbSaved : false })}
        editButtonLabel={instanceConfig.meta.translations?.editResponseLabel ?? tr.form.editResponse}
        onEdit={() => setPhase({ status: "idle" })}
      />
    );
  }

  // ── Success screen
  if (phase.status === "success") {
    const rawMessage =
      instanceConfig.successMessage ??
      instanceConfig.meta.translations?.successMessage ??
      null;

    const successTitle =
      instanceConfig.meta.translations?.successTitle ?? tr.form.successTitle;
    const successBody = rawMessage ? (
      <p className="text-muted-foreground">
        {rawMessage.replace(/\{\{(\w+)\}\}/g, (_, key) => fieldValues[key] ?? "")}
      </p>
    ) : phase.dbSaved ? (
      <p className="text-muted-foreground">
        {t(tr.form.successMessage, { email: "" }).split("{email}")[0]}
        <strong>{submittedEmail}</strong>
        {t(tr.form.successMessage, { email: "" }).split("{email}")[1]}
      </p>
    ) : (
      <p className="text-muted-foreground">{tr.form.print.successMessage}</p>
    );

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{successTitle}</h2>
        {successBody}
        {instanceConfig.successRedirectUrl && phase.dbSaved && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t(tr.form.redirect, { seconds: countdown, s: countdown !== 1 ? "s" : "" })}
          </p>
        )}
        <button
          type="button"
          onClick={() => setPhase({ status: "idle" })}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          {instanceConfig.meta.translations?.editResponseLabel ?? tr.form.editResponse}
        </button>
      </motion.div>
    );
  }

  // ── Error screen
  if (phase.status === "error") {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">{tr.form.actions.error}</h2>
        <p className="text-muted-foreground text-sm">{phase.message}</p>
      </div>
    );
  }

  const currentStep = steps[step - 1];
  if (!currentStep) return null;

  const submitting = phase.status === "running";

  // Derive submit button label from the set of enabled user-facing actions.
  // webhook_post is transparent (fire-and-forget) → never changes the label.
  // Always overridable via instanceConfig.meta.translations.submitButton.
  // If any enabled action produces a visible output for the user (print_view),
  // use a specific label. Combinations and edge cases are handled via
  // instanceConfig.meta.translations.submitButton (admin override).
  const enabledActions = instanceConfig.onSubmitActions?.filter(a => a.enabled !== false) ?? [];
  const hasPrint = enabledActions.some(a => a.type === "print_view");
  const submitLabel = hasPrint ? tr.form.print.submitButton : tr.form.submit;

  // Completion bar: ratio of filled visible fillable fields.
  // Prefers required fields as denominator; falls back to all fillable fields
  // when none are marked required (e.g. fully optional forms).
  let completionPercent = 0;
  if (features.completionBar) {
    const STRUCTURAL = new Set(["section_header", "alert", "computed"]);
    const visibleFillable = currentStep.fields.filter(
      f => !STRUCTURAL.has(f.type) && isFieldVisible(f),
    );
    const visibleRequired = visibleFillable.filter(f => f.required !== false);
    const denominator = visibleRequired.length > 0 ? visibleRequired : visibleFillable;
    const filled = denominator.filter(f => (allValues[f.id] ?? "").trim() !== "");
    completionPercent =
      denominator.length > 0 ? Math.round((filled.length / denominator.length) * 100) : 0;
  }

  // Section nav: visible section_header fields in current step
  const sectionHeaders =
    features.sectionNav
      ? currentStep.fields.filter(f => f.type === "section_header" && isFieldVisible(f))
      : [];

  return (
    <div className="w-full">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i + 1 < step
                  ? "bg-[var(--brand-primary)] text-white"
                  : i + 1 === step
                  ? "bg-[var(--brand-primary)] text-white ring-4 ring-[var(--brand-primary)]/20"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1 < step ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < totalSteps - 1 && (
              <div className={`flex-1 h-0.5 mx-2 transition-colors ${i + 1 < step ? "bg-[var(--brand-primary)]" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step counter */}
      <p className="text-center text-xs text-muted-foreground -mt-5 mb-6">
        {t(tr.form.step, { step, total: totalSteps })}
      </p>

      {/* Completion bar — sticky so it stays visible while scrolling */}
      {features.completionBar && (
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pt-1 pb-2 mb-4 -mx-2 px-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {t(tr.form.progressLabel ?? "{n}% completed", { n: completionPercent })}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completionPercent >= 100
                  ? "bg-green-500"
                  : completionPercent >= 50
                  ? "bg-orange-400"
                  : "bg-red-400"
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Section nav */}
      {sectionHeaders.length > 0 && (
        <nav className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-border">
          {sectionHeaders.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                document.getElementById(`section-${f.id}`)?.scrollIntoView({ behavior: "smooth" });
                setActiveSectionId(f.id);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeSectionId === f.id
                  ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                  : "text-muted-foreground border-input hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </nav>
      )}

      {/* Step content */}
      <div className="min-h-[280px]">
        <FormStep stepKey={step} direction={direction}>
          <div className="space-y-4">
            {(currentStep.title || currentStep.description) && (
              <div>
                {currentStep.title && (
                  <h2 className="text-xl font-semibold text-foreground">
                    {currentStep.title}
                  </h2>
                )}
                {currentStep.description && (
                  <p className="text-muted-foreground text-sm mt-1">
                    {currentStep.description}
                  </p>
                )}
              </div>
            )}
            {currentStep.fields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                value={getValue(field.id)}
                onChange={(v) => setValue(field.id, v)}
                error={errors[field.id]}
                allValues={allValues}
                optionalText={tr.form.optional}
                addRowLabel={tr.form.addRow}
                removeRowLabel={tr.form.removeRow}
              />
            ))}
          </div>
        </FormStep>
      </div>

      {errors._global && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {errors._global}
        </div>
      )}

      <div className="flex justify-between mt-8 pt-4 border-t border-border">
        <Button variant="secondary" onClick={goBack} disabled={step === 1}>
          {instanceConfig.meta.translations?.backButton ?? tr.form.back}
        </Button>
        {step < totalSteps ? (
          <Button onClick={goNext}>{instanceConfig.meta.translations?.nextButton ?? tr.form.next}</Button>
        ) : submitUrl ? (
          <Button onClick={handleSubmit} loading={submitting}>
            {instanceConfig.meta.translations?.submitButton ?? submitLabel}
          </Button>
        ) : (
          <Button disabled variant="outline">
            {tr.form.previewMode}
          </Button>
        )}
      </div>
    </div>
  );
}
