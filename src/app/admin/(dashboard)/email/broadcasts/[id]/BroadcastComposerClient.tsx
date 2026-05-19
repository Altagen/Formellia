"use client";

/**
 * Three-pane broadcast composer:
 *
 *   1. Settings: name + subject + DataPool checkboxes (server source of truth)
 *   2. Body:    TipTap WYSIWYG (preserves paste-from-web formatting)
 *   3. Preview: live recipient resolution + sanitized + CSS-inlined HTML
 *               render exactly as the provider will receive it
 *
 * Auto-save fires 800 ms after the operator stops typing. Once the broadcast
 * is sent (status != "draft") every field becomes read-only — manual edits to
 * a `sent` row would silently drift from the archive of what was delivered.
 */
import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Send, Eye, Pencil, Trash2, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RichTextEditor } from "@/components/admin/email/RichTextEditor";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { EmailBroadcast } from "@/lib/db/schema";
import type { GlobalEmailConfig } from "@/lib/email/globalEmailConfig";
import {
  ADDITIONAL_RECIPIENTS_MAX,
  parseAdditionalRecipients,
} from "@/lib/email/additionalRecipients";
import type { BroadcastErrorCode } from "@/lib/email/broadcastErrors";

/** Compile-time pin: every BroadcastErrorCode must have an i18n entry. */
type ErrorsMap = Record<BroadcastErrorCode, string>;

interface PoolOpt { id: string; name: string; slug: string }

interface Props {
  broadcast:      EmailBroadcast;
  pools:          PoolOpt[];
  providerConfig: GlobalEmailConfig;
}

interface PreviewState {
  loading:        boolean;
  recipientCount: number;
  recipients:     string[];   // truncated/redacted in render
  html:           string;
  text:           string;
  subject:        string;
}

export function BroadcastComposerClient({ broadcast: initial, pools, providerConfig }: Props) {
  const router = useRouter();
  const t = useTranslations().admin.email.composer;
  const [broadcast, setBroadcast] = useState(initial);
  const [tab, setTab] = useState<"compose" | "preview">("compose");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [sending, setSending] = useState(false);
  // Confirmation dialogs — `null` when nothing is pending. Using a union so a
  // single ConfirmDialog instance handles both delete + send (they're mutually
  // exclusive in the UI anyway).
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: "delete" }
    | { kind: "send"; count: number }
    | null
  >(null);

  // Live recipient count for the currently-checked pools. Refreshed via a
  // debounced fetch on every toggle so the operator sees "X destinataires"
  // before opening the Preview tab. `null` means "not computed yet"; a
  // number is the latest merged-and-deduplicated total across selected pools
  // AND any ad-hoc addresses the operator typed into the free-text input.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [liveCountLoading, setLiveCountLoading] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Free-text "Adresses additionnelles" — operator-typed buffer kept as a
  // single string so newlines / commas / mixed separators render back the way
  // they were typed. The parsed-and-deduplicated email list is derived via
  // useMemo and is the value we ship to the server.
  const [additionalRaw, setAdditionalRaw] = useState<string>(
    (broadcast.additionalRecipients ?? []).join(", "),
  );
  const additionalParsed = useMemo(
    () => parseAdditionalRecipients(additionalRaw),
    [additionalRaw],
  );
  const additionalCapped = additionalParsed.valid.length >= ADDITIONAL_RECIPIENTS_MAX;

  // `failed` is treated as editable: by definition (sent_count === 0) nothing
  // reached an inbox, so this is functionally the same situation as a draft —
  // the operator just needs to fix the config and try again. Editing or
  // re-sending transitions the row back through draft → sending → sent/failed
  // on the next attempt, and the existing lastError is cleared by the PATCH.
  const readOnly = broadcast.status !== "draft" && broadcast.status !== "failed";

  // ── Auto-save on idle ─────────────────────────────────────
  // Build a debounced save so every keystroke doesn't hit the API. 800 ms is
  // a sweet spot: long enough not to spam the server during typing, short
  // enough that the operator sees "Saved" before they reach for the Send
  // button. Skipped entirely when the row is no longer a draft.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (readOnly || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/email/broadcasts/${broadcast.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            name:                 broadcast.name,
            subject:              broadcast.subject,
            bodyHtml:             broadcast.bodyHtml,
            bodyText:             broadcast.bodyText,
            dataPoolIds:          broadcast.dataPoolIds,
            additionalRecipients: additionalParsed.valid,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        // Merge the server's view of the row back into local state. This is
        // what flips a `failed` row back to `draft` (and clears lastError /
        // failed_count) once an edit is saved, so the red banner at the top
        // of the page disappears immediately rather than waiting for a
        // navigation. We keep the user-visible buffers (subject / body /
        // dataPoolIds) as-is because they're already the source of truth
        // in the local state.
        const saved = (await res.json()) as EmailBroadcast;
        setBroadcast(b => ({
          ...b,
          status:      saved.status,
          lastError:   saved.lastError,
          failedCount: saved.failedCount,
          sentCount:   saved.sentCount,
          updatedAt:   saved.updatedAt,
        }));
        setDirty(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t.autoSaveFailed);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [broadcast, additionalParsed, dirty, readOnly]);

  function update<K extends keyof EmailBroadcast>(key: K, val: EmailBroadcast[K]) {
    setBroadcast(b => ({ ...b, [key]: val }));
    setDirty(true);
  }

  function togglePool(id: string) {
    // Allow unchecking everything — the operator may want a clean slate to
    // pick a different set. The inline message below the picker keeps the
    // empty state visible, and the Send button is disabled until at least
    // one pool is checked AND the merged recipient count is > 0.
    const next = broadcast.dataPoolIds.includes(id)
      ? broadcast.dataPoolIds.filter(p => p !== id)
      : [...broadcast.dataPoolIds, id];
    update("dataPoolIds", next);
  }

  // Tabs metadata — drives the strip below the header. Keeping it inline
  // (rather than mapping over a string list) makes the icon binding obvious.
  const tabs: Array<{ id: "compose" | "preview"; label: string; icon: typeof Pencil }> = [
    { id: "compose", label: t.tabCompose, icon: Pencil },
    { id: "preview", label: t.tabPreview, icon: Eye },
  ];

  // ── Live recipient-count refresh ──────────────────────────
  // Re-fetches the merged dedup count whenever the pool selection changes.
  // Debounced 400 ms so a series of quick toggles (e.g. "deselect all,
  // reselect three") only fires one query. Uses the stateless endpoint
  // /api/admin/email/recipient-count — no broadcast row needed.
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    // Local short-circuit when both sources are empty — avoids a server
    // round-trip for "nothing selected" which is the default state.
    if (broadcast.dataPoolIds.length === 0 && additionalParsed.valid.length === 0) {
      setLiveCount(0);
      return;
    }
    setLiveCountLoading(true);
    countTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/email/recipient-count", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            dataPoolIds:          broadcast.dataPoolIds,
            additionalRecipients: additionalParsed.valid,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { recipientCount: number };
        setLiveCount(data.recipientCount);
      } catch {
        // Soft-failure: leave the count as "?" rather than blocking interaction
        setLiveCount(null);
      } finally {
        setLiveCountLoading(false);
      }
    }, 400);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  }, [broadcast.dataPoolIds, additionalParsed]);

  // Used to gate the Send and Preview buttons. The merged count is the
  // source of truth — either source (pools OR free-text) can carry the
  // broadcast on its own as long as `liveCount > 0`.
  const hasPools          = broadcast.dataPoolIds.length > 0;
  const hasExtras         = additionalParsed.valid.length > 0;
  const hasAnyRecipients  = liveCount !== null && liveCount > 0;
  const canSend           = !readOnly && (hasPools || hasExtras) && hasAnyRecipients && !sending;

  async function loadPreview() {
    setTab("preview");
    setPreview({ loading: true, recipientCount: 0, recipients: [], html: "", text: "", subject: "" });
    try {
      const res = await fetch(`/api/admin/email/broadcasts/${broadcast.id}/preview`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Omit<PreviewState, "loading">;
      setPreview({ loading: false, ...data });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.sendFailedToast);
      setPreview(null);
    }
  }

  async function send() {
    // Use the live merged count rather than the preview count — the preview
    // pane might not have been opened yet, and `liveCount` is kept fresh by
    // the debounced effect above. Both should agree but live is the source
    // of truth here.
    const total = liveCount ?? preview?.recipientCount ?? 0;
    if (total === 0) {
      toast.error(t.noRecipientsToast);
      return;
    }
    // Defer to the ConfirmDialog — the actual POST happens in `confirmSend`
    // once the operator agrees.
    setPendingConfirm({ kind: "send", count: total });
  }

  // Pin the i18n error bundle to the canonical union — if either side adds a
  // code without the other, this assignment fails to compile. The runtime
  // value is the same `t.errors` object; only the static type narrows.
  const errors: ErrorsMap = t.errors;

  async function confirmSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/email/broadcasts/${broadcast.id}/send`, { method: "POST" });
      // Non-OK: the API returns a structured `{ code, error, ...args }` body.
      // We translate the code to a localized string, falling back to the raw
      // English `error` if the code is unknown (forward-compat).
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as {
          code?: BroadcastErrorCode; error?: string; status?: string;
        };
        const localized = body.code && errors[body.code]
          ? errors[body.code].replace("{status}", body.status ?? "")
          : (body.error ?? t.sendFailedToast);
        throw new Error(localized);
      }
      const r = (await res.json()) as { sent: number; failed: number; error?: string };
      // When the provider returned errors for some/all recipients the
      // executeBroadcast result still has a 200 status (the row was claimed
      // and updated) but `r.error` carries the first provider message. The
      // service prefixes well-known reasons with "code:<key> — " so we strip
      // that prefix and translate when possible; raw provider errors (like
      // Resend's "401 invalid api key") fall through untouched.
      if (r.failed > 0) {
        const localized = localizeServiceError(r.error, errors);
        const detail = localized ? `: ${localized}` : "";
        toast.error(
          t.sendResultToast.replace("{sent}", String(r.sent)).replace("{failed}", String(r.failed)) + detail,
          { duration: 10_000 },
        );
      } else {
        toast.success(
          t.sendResultToast.replace("{sent}", String(r.sent)).replace("{failed}", String(r.failed)),
        );
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.sendFailedToast);
    } finally {
      setSending(false);
    }
  }

  function destroy() {
    setPendingConfirm({ kind: "delete" });
  }

  async function confirmDelete() {
    const res = await fetch(`/api/admin/email/broadcasts/${broadcast.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t.deleteFailed); return; }
    router.push("/admin/email/broadcasts");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/email/broadcasts" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> {t.backLink}
        </Link>
        {/* Title row — only the Input lives next to the buttons so */}
        {/* `items-center` aligns them on a single line. The save-status */}
        {/* paragraph drops to the line below to avoid pulling the */}
        {/* buttons off-axis by half the paragraph's height. */}
        <div className="flex items-center justify-between mt-2 gap-3">
          <Input
            value={broadcast.name}
            onChange={e => update("name", e.target.value)}
            disabled={readOnly}
            className="flex-1 min-w-0 text-xl font-bold border-none px-0 focus-visible:ring-0 shadow-none"
            placeholder={t.namePlaceholder}
          />
          <div className="flex gap-2 shrink-0">
            {/* The Preview button used to live here; it duplicated the */}
            {/* Preview tab below. Consolidated into the tab strip. */}
            {!readOnly && (
              <Button type="button" onClick={send} disabled={!canSend}>
                <Send className="w-4 h-4 mr-1" /> {sending ? t.sendingButton : t.sendButton}
              </Button>
            )}
            {!readOnly && (
              <Button type="button" variant="outline" onClick={destroy} title={t.deleteTitle}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {saving ? t.saving : dirty ? t.dirty : t.saved}
          {" · "}{t.statusLabel} <span className="font-medium">{broadcast.status}</span>
        </p>
      </div>

      {/* Provider warning — surfaces here too in case the operator dropped into */}
      {/* the composer directly from the list view's "New draft" button. */}
      {(!providerConfig.provider || !providerConfig.apiKeyConfigured) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          ⚠ {t.providerWarning} <Link href="/admin/email/provider" className="underline font-medium">{t.configureNow}</Link>.
        </div>
      )}

      {broadcast.status === "failed" && broadcast.lastError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-200">
          {t.lastSendFailure}{" "}
          <span className="font-mono">
            {localizeServiceError(broadcast.lastError, errors) ?? broadcast.lastError}
          </span>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id}
                  onClick={() => id === "preview" ? loadPreview() : setTab(id)}
                  className={`px-4 py-2 text-sm border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Both panes stay mounted — toggled via CSS — so TipTap's internal */}
      {/* state (cursor, undo, source-mode toggle) survives switching to */}
      {/* Preview and back. Unmounting on tab switch used to re-parse */}
      {/* `bodyHtml` through TipTap's semantic filter, dropping styled */}
      {/* <div>s the operator had just pasted via the 📋 button. */}
      <div className={`space-y-5 ${tab === "compose" ? "" : "hidden"}`}>
          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t.subjectLabel}</label>
            <Input
              value={broadcast.subject}
              onChange={e => update("subject", e.target.value)}
              disabled={readOnly}
              placeholder={t.subjectPlaceholder}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t.bodyLabel}</label>
            <RichTextEditor
              value={broadcast.bodyHtml}
              onChange={html => update("bodyHtml", html)}
              disabled={readOnly}
            />
            <p className="text-xs text-muted-foreground mt-1">{t.bodyHint}</p>
          </div>

          {/* DataPools picker */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
              <span>{t.recipientsLabel}</span>
              {/* Live count badge — refreshed on every toggle via the */}
              {/* /api/admin/email/recipient-count endpoint. */}
              {hasPools && (
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Users className="w-3 h-3" />
                  {liveCountLoading ? (
                    <span className="text-muted-foreground">{t.counting}</span>
                  ) : liveCount === null ? (
                    <span className="text-muted-foreground">?</span>
                  ) : (
                    <span className="font-medium">{liveCount} {liveCount === 1 ? t.recipientsUnitSingular : t.recipientsUnit}</span>
                  )}
                  <span className="text-muted-foreground"> · {broadcast.dataPoolIds.length} {broadcast.dataPoolIds.length === 1 ? t.poolsUnitSingular : t.poolsUnit}</span>
                </span>
              )}
            </label>
            <div className="space-y-1.5 border border-border rounded-md p-3 bg-card max-h-[200px] overflow-y-auto">
              {pools.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.noPools} <Link href="/admin/datapools" className="underline">{t.createPoolLink}</Link>.</p>
              ) : pools.map(p => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={broadcast.dataPoolIds.includes(p.id)}
                    onChange={() => togglePool(p.id)}
                    disabled={readOnly}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{p.slug}</span>
                </label>
              ))}
            </div>

            {/* Inline status messages — three states, ordered by severity.
                Now scoped on the merged total (pools + extras) so an
                all-ad-hoc draft is still considered "has recipients". */}
            {!hasPools && !hasExtras ? (
              <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 mt-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{t.atLeastOnePool}</span>
              </div>
            ) : !liveCountLoading && liveCount === 0 ? (
              <div className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300 mt-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{t.emptyAudience}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">{t.mergedHint}</p>
            )}
          </div>

          {/* Free-text "Adresses additionnelles" — merged with the DataPool
              selection at preview/send time. The textarea keeps the raw
              keystrokes (so newlines / mixed separators survive a save→reload)
              while the parsed list above drives validation feedback. */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t.additionalRecipientsLabel}
            </label>
            <textarea
              value={additionalRaw}
              onChange={e => {
                setAdditionalRaw(e.target.value);
                setDirty(true);
              }}
              disabled={readOnly}
              rows={3}
              placeholder={t.additionalRecipientsPlaceholder}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-[3px] focus:ring-ring/50 resize-y disabled:opacity-50"
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1 text-xs">
              <span className="text-muted-foreground">{t.additionalRecipientsHint}</span>
              {additionalParsed.valid.length > 0 && (
                <span className="text-emerald-700 dark:text-emerald-300">
                  {t.additionalRecipientsValidCount.replace("{count}", String(additionalParsed.valid.length))}
                </span>
              )}
              {additionalParsed.invalid.length > 0 && (
                <span className="text-amber-700 dark:text-amber-300">
                  {t.additionalRecipientsInvalidCount
                    .replace("{count}", String(additionalParsed.invalid.length))
                    .replace("{list}", additionalParsed.invalid.slice(0, 3).join(", ")
                      + (additionalParsed.invalid.length > 3 ? "…" : ""))}
                </span>
              )}
              {additionalCapped && (
                <span className="text-red-700 dark:text-red-300">
                  {t.additionalRecipientsCapped.replace("{max}", String(ADDITIONAL_RECIPIENTS_MAX))}
                </span>
              )}
            </div>
          </div>
      </div>

      {tab === "preview" && (
        <div className="space-y-4">
          {!preview || preview.loading ? (
            <p className="text-sm text-muted-foreground">{t.previewLoading}</p>
          ) : (
            <>
              <div className="rounded-md border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-medium">
                    {t.previewRecipientsCount.replace("{count}", String(preview.recipientCount))}
                  </div>
                  {preview.recipients.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(preview.recipients.join(", "));
                          toast.success(t.listCopied);
                        } catch {
                          toast.error(t.copyFailed);
                        }
                      }}
                    >
                      {t.copyList}
                    </button>
                  )}
                </div>
                {/* Full list — scrollable, monospace, plain (no redaction). The */}
                {/* operator running the preview already has admin access; hiding */}
                {/* the addresses from themselves was making it impossible to */}
                {/* double-check who they were about to email. */}
                {preview.recipients.length > 0 && (
                  <div className="mt-2 max-h-[160px] overflow-y-auto rounded border border-border/50 bg-muted/30 p-2">
                    <div className="text-xs font-mono break-all leading-relaxed text-muted-foreground">
                      {preview.recipients.join(", ")}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border bg-card">
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs">
                  <span className="text-muted-foreground">{t.previewSubjectLabel} </span>
                  <span className="font-medium">{preview.subject || <em>{t.noSubject}</em>}</span>
                </div>
                {/* Iframe sandbox — isolates the email from the admin shell's */}
                {/* Tailwind / typography styles, so what the operator sees is */}
                {/* very close to what a recipient sees in their inbox client. */}
                {/* `srcDoc` doesn't trigger a network request and is GDPR-safe. */}
                {/* The sandbox attribute strips scripts, popups, top-nav, etc. */}
                <iframe
                  title={t.previewIframeTitle}
                  sandbox=""
                  srcDoc={previewSrcDoc(preview.html)}
                  className="w-full h-[600px] border-0 bg-white"
                />
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.plainTextDetails}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-muted/30 p-3 rounded">{preview.text}</pre>
              </details>
              {!readOnly && (
                <div className="flex justify-end">
                  <Button onClick={send} disabled={sending || preview.recipientCount === 0}>
                    <Send className="w-4 h-4 mr-1" /> {sending ? t.sendingButton : t.sendNow}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {readOnly && (
        <div className="text-xs text-muted-foreground italic">
          {t.readOnlyHint}
          {broadcast.status === "sent" && broadcast.sentAt &&
            t.sentOnHint.replace("{date}", new Date(broadcast.sentAt).toLocaleString())
          }.
        </div>
      )}

      {/* Confirmation dialogs — single instance, content driven by `pendingConfirm`. */}
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={
          pendingConfirm?.kind === "send"   ? t.confirmSendTitle :
          pendingConfirm?.kind === "delete" ? t.confirmDeleteTitle : ""
        }
        description={
          pendingConfirm?.kind === "send"
            ? t.confirmSend.replace("{count}", String(pendingConfirm.count))
            : pendingConfirm?.kind === "delete"
              ? t.deleteConfirm
              : ""
        }
        confirmLabel={
          pendingConfirm?.kind === "send"   ? t.sendButton :
          pendingConfirm?.kind === "delete" ? t.deleteTitle : ""
        }
        cancelLabel={t.confirmCancel}
        destructive={pendingConfirm?.kind === "delete"}
        onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}
        onConfirm={() => {
          if (pendingConfirm?.kind === "send")   confirmSend();
          if (pendingConfirm?.kind === "delete") confirmDelete();
          setPendingConfirm(null);
        }}
      />
    </div>
  );
}

/**
 * Translate a `code:<key> — <fallback>` string that the executeBroadcast
 * service writes into `email_broadcasts.last_error` and returns in the send
 * response. Falls back to the raw text when the code isn't recognised — that
 * way provider errors (e.g. "Resend 401: API key is invalid") still surface
 * verbatim instead of being silently swallowed.
 */
function localizeServiceError(
  raw: string | undefined,
  errors: Record<string, string>,
): string | undefined {
  if (!raw) return undefined;
  // `[\s\S]` instead of `.` so the fallback portion can contain newlines
  // without needing the `s` (dotAll) flag, which requires ES2018+.
  const match = /^code:([a-zA-Z]+)\s*(?:[—-]\s*([\s\S]*))?$/.exec(raw);
  if (!match) return raw;
  const [, code, fallback] = match;
  return errors[code] ?? fallback ?? raw;
}

/**
 * Wraps the email HTML in a minimal document with the page background and
 * font defaults most inboxes apply. Keeps the iframe rendering close to
 * what a recipient sees — without leaking the admin shell's CSS.
 */
function previewSrcDoc(html: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body { margin:0; padding:24px; background:#f3f4f6; font-family:-apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#1f2937; }
  a { color:inherit; }
</style>
</head><body>${html}</body></html>`;
}
