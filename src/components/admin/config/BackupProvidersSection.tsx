"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, CheckCircle2, XCircle, Play, Archive,
  RotateCcw, ChevronDown, ChevronRight, Settings, Loader2, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "@/lib/context/LocaleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type RetentionType = "keep_all" | "keep_last_n" | "keep_last_days";

interface RetentionPolicy {
  type: RetentionType;
  n?: number;
  days?: number;
}

interface ProviderRow {
  id: string;
  name: string;
  type: "local" | "s3";
  enabled: boolean;
  encryptBackup: boolean;
  retentionPolicy: RetentionPolicy;
  createdAt: string;
}

interface BackupFile {
  key: string;
  filename: string;
  size: number;
  createdAt: string;
}

interface FormOption { id: string; slug: string; name: string }
interface DatasetOption { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── Provider Form ────────────────────────────────────────────────────────────

interface ProviderFormProps {
  initial?: Partial<ProviderRow & { config?: Record<string, unknown> }>;
  onSave: () => void;
  onCancel: () => void;
  tr: ReturnType<typeof useTranslations>;
}

function ProviderForm({ initial, onSave, onCancel, tr }: ProviderFormProps) {
  const b = tr.admin.config.backup;
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<"local" | "s3">(initial?.type ?? "local");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [encryptBackup, setEncryptBackup] = useState(initial?.encryptBackup ?? false);
  const [retentionType, setRetentionType] = useState<RetentionType>(initial?.retentionPolicy?.type ?? "keep_all");
  const [retentionN, setRetentionN] = useState(initial?.retentionPolicy && "n" in initial.retentionPolicy ? String(initial.retentionPolicy.n) : "30");
  const [retentionDays, setRetentionDays] = useState(initial?.retentionPolicy && "days" in initial.retentionPolicy ? String(initial.retentionPolicy.days) : "90");

  // Local config
  const [localPath, setLocalPath] = useState("");

  // S3 config
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);
  const [s3Prefix, setS3Prefix] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function buildConfig(): Record<string, unknown> {
    if (type === "local") return { path: localPath };
    return {
      endpoint:       s3Endpoint,
      region:         s3Region,
      bucket:         s3Bucket,
      accessKeyId:    s3AccessKey,
      secretAccessKey: s3SecretKey,
      ...(s3ForcePathStyle ? { forcePathStyle: true } : {}),
      ...(s3Prefix ? { prefix: s3Prefix } : {}),
    };
  }

  function buildRetention(): RetentionPolicy {
    if (retentionType === "keep_last_n")   return { type: "keep_last_n",   n:    parseInt(retentionN, 10) };
    if (retentionType === "keep_last_days") return { type: "keep_last_days", days: parseInt(retentionDays, 10) };
    return { type: "keep_all" };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name,
        type,
        config: buildConfig(),
        enabled,
        encryptBackup,
        retentionPolicy: buildRetention(),
      };
      const url    = isEdit ? `/api/admin/backup/providers/${initial!.id}` : "/api/admin/backup/providers";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { name, enabled, encryptBackup, retentionPolicy: buildRetention(), ...(isConfigChanged() ? { config: buildConfig() } : {}) } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? b.networkError); return; }
      toast.success(b.providerSaved);
      onSave();
    } catch {
      toast.error(b.networkError);
    } finally {
      setSaving(false);
    }
  }

  function isConfigChanged() {
    // When editing, always send config if any s3/local field is filled
    if (type === "local") return localPath.length > 0;
    return s3Endpoint.length > 0 || s3Bucket.length > 0 || s3AccessKey.length > 0 || s3SecretKey.length > 0;
  }

  async function handleTest() {
    if (!initial?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res  = await fetch(`/api/admin/backup/providers/${initial.id}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: data.success === true, error: data.error });
    } catch {
      setTestResult({ ok: false, error: b.networkError });
    } finally {
      setTesting(false);
    }
  }

  const inputCls = "w-full text-xs border border-input rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Name */}
        <div>
          <label className={labelCls}>{b.providerName}</label>
          <input
            className={inputCls}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={b.providerNamePlaceholder}
          />
        </div>

        {/* Type (immutable on edit) */}
        <div>
          <label className={labelCls}>{b.providerType}</label>
          <select
            className={inputCls}
            value={type}
            onChange={e => setType(e.target.value as "local" | "s3")}
            disabled={isEdit}
          >
            <option value="local">{b.providerTypeLocal}</option>
            <option value="s3">{b.providerTypeS3}</option>
          </select>
        </div>
      </div>

      {/* Provider-specific config */}
      {type === "local" ? (
        <div>
          <label className={labelCls}>{b.localPath}</label>
          <input
            className={inputCls}
            value={localPath}
            onChange={e => setLocalPath(e.target.value)}
            placeholder={b.localPathHint}
          />
          {isEdit && <p className="text-xs text-muted-foreground mt-1">{b.editKeepEmpty}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{b.s3Endpoint}</label>
              <input className={inputCls} value={s3Endpoint} onChange={e => setS3Endpoint(e.target.value)} placeholder={b.s3EndpointHint} />
            </div>
            <div>
              <label className={labelCls}>{b.s3Region}</label>
              <input className={inputCls} value={s3Region} onChange={e => setS3Region(e.target.value)} placeholder="us-east-1" />
            </div>
            <div>
              <label className={labelCls}>{b.s3Bucket}</label>
              <input className={inputCls} value={s3Bucket} onChange={e => setS3Bucket(e.target.value)} placeholder="my-bucket" />
            </div>
            <div>
              <label className={labelCls}>{b.s3Prefix}</label>
              <input className={inputCls} value={s3Prefix} onChange={e => setS3Prefix(e.target.value)} placeholder={b.s3PrefixHint} />
            </div>
            <div>
              <label className={labelCls}>{b.s3AccessKey}</label>
              <input className={inputCls} value={s3AccessKey} onChange={e => setS3AccessKey(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={labelCls}>{b.s3SecretKey}</label>
              <input className={`${inputCls} font-mono`} type="password" value={s3SecretKey} onChange={e => setS3SecretKey(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={s3ForcePathStyle} onChange={e => setS3ForcePathStyle(e.target.checked)} className="accent-primary" />
            {b.s3ForcePathStyle}
          </label>
          {isEdit && <p className="text-xs text-muted-foreground">{b.editKeepCreds}</p>}
        </div>
      )}

      {/* Retention */}
      <div>
        <label className={labelCls}>{b.retention}</label>
        <div className="flex flex-wrap gap-4">
          {(["keep_all", "keep_last_n", "keep_last_days"] as RetentionType[]).map(rt => (
            <label key={rt} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="retention" value={rt} checked={retentionType === rt} onChange={() => setRetentionType(rt)} className="accent-primary" />
              {rt === "keep_all" ? b.retentionKeepAll : rt === "keep_last_n" ? b.retentionKeepN.replace("{n}", retentionN) : b.retentionKeepDays.replace("{days}", retentionDays)}
            </label>
          ))}
        </div>
        {retentionType === "keep_last_n" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{b.retentionN}</span>
            <input type="number" min={1} max={9999} className={`${inputCls} w-24`} value={retentionN} onChange={e => setRetentionN(e.target.value)} />
          </div>
        )}
        {retentionType === "keep_last_days" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{b.retentionDays}</span>
            <input type="number" min={1} max={3650} className={`${inputCls} w-24`} value={retentionDays} onChange={e => setRetentionDays(e.target.value)} />
          </div>
        )}
      </div>

      {/* Enabled */}
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-primary" />
        {b.providerEnabled}
      </label>

      {/* Encrypt backup archives */}
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={encryptBackup} onChange={e => setEncryptBackup(e.target.checked)} className="accent-primary" />
        {b.encryptBackup}
      </label>
      {encryptBackup && (
        <p className="text-xs text-muted-foreground -mt-2">{b.encryptBackupHint}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving || !name} onClick={handleSave}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          {tr.admin.config.save}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {tr.admin.config.forms.cancel}
        </Button>

        {isEdit && (
          <>
            <Button type="button" size="sm" variant="outline" disabled={testing} onClick={handleTest}>
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Settings className="w-3.5 h-3.5 mr-1.5" />}
              {b.providerTest}
            </Button>
            {testResult && (
              testResult.ok
                ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />{b.providerTestOk}</span>
                : <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="w-3.5 h-3.5" />{b.providerTestFail.replace("{error}", testResult.error ?? "")}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Run Backup Panel ─────────────────────────────────────────────────────────

interface RunBackupPanelProps {
  providers: ProviderRow[];
  forms: FormOption[];
  datasets: DatasetOption[];
  tr: ReturnType<typeof useTranslations>;
}

function RunBackupPanel({ providers, forms, datasets, tr }: RunBackupPanelProps) {
  const b = tr.admin.config.backup;
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [allForms, setAllForms] = useState(true);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [allDatasets, setAllDatasets] = useState(true);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const enabledProviders = providers.filter(p => p.enabled);

  useEffect(() => {
    if (enabledProviders.length > 0 && !providerId) {
      setProviderId(enabledProviders[0].id);
    }
  }, [enabledProviders, providerId]);

  async function handleRun() {
    if (!providerId) return;
    setRunning(true);
    try {
      const payload: Record<string, unknown> = { providerId };
      if (!allForms)    payload.formSlugs    = selectedForms;
      if (!allDatasets) payload.datasetNames = selectedDatasets;

      const res  = await fetch("/api/admin/backup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? b.runBackupError); return; }
      toast.success(b.runBackupSuccess
        .replace("{filename}", data.filename ?? "")
        .replace("{size}", formatBytes(data.sizeBytes ?? 0))
      );
      setOpen(false);
    } catch {
      toast.error(b.networkError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{b.runBackup}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{b.runBackupDesc}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(v => !v)}>
          {open ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
          {b.runBackupRun}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Provider selection */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{b.runBackupProvider}</label>
            <select
              className="w-full text-xs border border-input rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
            >
              {enabledProviders.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>

          {/* Forms */}
          <div>
            <label className="flex items-center gap-2 text-xs cursor-pointer mb-1">
              <input type="checkbox" checked={allForms} onChange={e => setAllForms(e.target.checked)} className="accent-primary" />
              {b.runBackupAllForms}
            </label>
            {!allForms && (
              <div className="flex flex-wrap gap-2 mt-1">
                {forms.map(f => (
                  <label key={f.slug} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedForms.includes(f.slug)}
                      onChange={e => setSelectedForms(prev => e.target.checked ? [...prev, f.slug] : prev.filter(s => s !== f.slug))}
                      className="accent-primary"
                    />
                    {f.name} ({f.slug})
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Datasets */}
          <div>
            <label className="flex items-center gap-2 text-xs cursor-pointer mb-1">
              <input type="checkbox" checked={allDatasets} onChange={e => setAllDatasets(e.target.checked)} className="accent-primary" />
              {b.runBackupAllDatasets}
            </label>
            {!allDatasets && (
              <div className="flex flex-wrap gap-2 mt-1">
                {datasets.map(d => (
                  <label key={d.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDatasets.includes(d.name)}
                      onChange={e => setSelectedDatasets(prev => e.target.checked ? [...prev, d.name] : prev.filter(n => n !== d.name))}
                      className="accent-primary"
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button type="button" size="sm" disabled={running || !providerId} onClick={handleRun}>
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
            {b.runBackupRun}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Browse & Restore Panel ───────────────────────────────────────────────────

interface BrowseRestorePanelProps {
  providers: ProviderRow[];
  tr: ReturnType<typeof useTranslations>;
}

function BrowseRestorePanel({ providers, tr }: BrowseRestorePanelProps) {
  const b = tr.admin.config.backup;
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (providers.length > 0 && !providerId) setProviderId(providers[0].id);
  }, [providers, providerId]);

  async function loadFiles() {
    if (!providerId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/backup/list?providerId=${providerId}`);
      const data = await res.json().catch(() => []);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      toast.error(b.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(key: string) {
    setRestoring(key);
    try {
      const res  = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, key, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? b.networkError); return; }
      toast.success(b.restoreFromProviderSuccess);
    } catch {
      toast.error(b.networkError);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{b.restoreFromProvider}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{b.browseBackups}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(v => !v); if (!open) loadFiles(); }}>
          {open ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
          {b.browseBackups}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Provider */}
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{b.runBackupProvider}</label>
              <select
                className="w-full text-xs border border-input rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={providerId}
                onChange={e => { setProviderId(e.target.value); setFiles([]); }}
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>
            {/* Mode */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{b.restoreModeLabel}</label>
              <select
                className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={mode}
                onChange={e => setMode(e.target.value as "replace" | "append")}
              >
                <option value="replace">{b.restoreModeReplace}</option>
                <option value="append">{b.restoreModeAppend}</option>
              </select>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={loadFiles} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {/* File list */}
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{loading ? "…" : b.noBackupFiles}</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {files.map(f => (
                <div key={f.key} className="flex items-center justify-between px-3 py-2 text-xs bg-muted/20">
                  <div>
                    <span className="font-mono font-medium">{f.filename}</span>
                    <span className="ml-3 text-muted-foreground">{formatBytes(f.size)}</span>
                    <span className="ml-3 text-muted-foreground">{formatDate(f.createdAt)}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restoring === f.key}
                    onClick={() => handleRestore(f.key)}
                  >
                    {restoring === f.key
                      ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      : <RotateCcw className="w-3 h-3 mr-1" />
                    }
                    {b.restoreThis}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BackupProvidersSection() {
  const tr = useTranslations();
  const b  = tr.admin.config.backup;

  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [forms, setForms]         = useState<FormOption[]>([]);
  const [datasets, setDatasets]   = useState<DatasetOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, fRes, dRes] = await Promise.all([
        fetch("/api/admin/backup/providers"),
        fetch("/api/admin/forms"),
        fetch("/api/admin/datasets"),
      ]);
      const [pData, fData, dData] = await Promise.all([
        pRes.json().catch(() => []),
        fRes.json().catch(() => []),
        dRes.json().catch(() => []),
      ]);
      setProviders(Array.isArray(pData) ? pData : []);
      setForms(Array.isArray(fData) ? fData : []);
      setDatasets(Array.isArray(dData) ? dData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  async function handleDelete(id: string) {
    setDeleteTarget(null);
    setDeleting(id);
    try {
      const res  = await fetch(`/api/admin/backup/providers/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? b.networkError); return; }
      toast.success(b.providerDeleted);
      await loadProviders();
    } catch {
      toast.error(b.networkError);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{b.providers}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{b.providersDesc}</p>
        </div>
        <Button type="button" size="sm" onClick={() => { setShowAdd(true); setEditId(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {b.addProvider}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <ProviderForm
          tr={tr}
          onSave={() => { setShowAdd(false); loadProviders(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Provider list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> …
        </div>
      ) : providers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">{b.noProviders}</p>
      ) : (
        <div className="space-y-2">
          {providers.map(p => (
            <div key={p.id}>
              <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${p.enabled ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">{p.type}</span>
                    {p.encryptBackup && <Lock className="w-3 h-3 text-amber-500" aria-label={b.encryptBackup} />}
                    {!p.enabled && <span className="text-[10px] text-muted-foreground">{b.providerDisabled}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {p.retentionPolicy.type === "keep_all"
                      ? b.retentionKeepAll
                      : p.retentionPolicy.type === "keep_last_n"
                        ? b.retentionKeepN.replace("{n}", String((p.retentionPolicy as { n: number }).n))
                        : b.retentionKeepDays.replace("{days}", String((p.retentionPolicy as { days: number }).days))}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => setEditId(editId === p.id ? null : p.id)}
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost"
                    disabled={deleting === p.id}
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                    className="text-destructive hover:text-destructive"
                  >
                    {deleting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {editId === p.id && (
                <div className="mt-1 ml-4">
                  <ProviderForm
                    initial={p}
                    tr={tr}
                    onSave={() => { setEditId(null); loadProviders(); }}
                    onCancel={() => setEditId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Run backup + Browse restore */}
      {providers.length > 0 && (
        <>
          <RunBackupPanel providers={providers} forms={forms} datasets={datasets} tr={tr} />
          <BrowseRestorePanel providers={providers} tr={tr} />
        </>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={b.deleteProviderConfirm}
        description={`${b.deleteProviderDesc}\n\n"${deleteTarget?.name ?? ""}"`}
        confirmLabel={b.deleteProvider}
        cancelLabel={tr.admin.config.forms.cancel}
        destructive
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); }}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
      />
    </div>
  );
}
