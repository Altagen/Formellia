"use client";

import { useState } from "react";
import type { PriorityThresholds } from "@/lib/utils/priority";
import { useTranslations } from "@/lib/context/LocaleContext";

const PRIORITY_COLORS = {
  red: { bg: "bg-red-500", text: "text-red-700", border: "border-red-300", light: "bg-red-50" },
  orange: { bg: "bg-orange-500", text: "text-orange-700", border: "border-orange-300", light: "bg-orange-50" },
  yellow: { bg: "bg-yellow-400", text: "text-yellow-700", border: "border-yellow-300", light: "bg-yellow-50" },
  green: { bg: "bg-green-500", text: "text-green-700", border: "border-green-300", light: "bg-green-50" },
};

interface Props {
  initial: PriorityThresholds;
}

export function PrioritySettingsForm({ initial }: Props) {
  const [red, setRed] = useState(initial.redMaxDays);
  const [orange, setOrange] = useState(initial.orangeMaxDays);
  const [yellow, setYellow] = useState(initial.yellowMaxDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const tr = useTranslations();
  const p = tr.admin.priority;

  const isValid = red >= 0 && red < orange && orange < yellow;

  function daysLabel(n: number) {
    return n === 1 ? p.daysRemaining_one : p.daysRemaining_other;
  }

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redMaxDays: red, orangeMaxDays: orange, yellowMaxDays: yellow }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? p.errorSave);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(p.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Visual preview */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{p.preview}</p>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
            <span className="text-muted-foreground">
              {p.overduePrefix} <strong>{red}</strong> {daysLabel(red)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
            <span className="text-muted-foreground">
              <strong>{red + 1}</strong> {p.rangeTo} <strong>{orange}</strong> {daysLabel(orange)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
            <span className="text-muted-foreground">
              <strong>{orange + 1}</strong> {p.rangeTo} <strong>{yellow}</strong> {daysLabel(yellow)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
            <span className="text-muted-foreground">
              {p.moreThan} <strong>{yellow}</strong> {p.daysRemaining_other}
            </span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-4">
        <ThresholdInput
          color="red"
          label={p.redLabel}
          value={red}
          onChange={setRed}
          min={0}
          max={orange - 1}
          hint={p.redHint}
          days={p.days}
        />
        <ThresholdInput
          color="orange"
          label={p.orangeLabel}
          value={orange}
          onChange={setOrange}
          min={red + 1}
          max={yellow - 1}
          hint={p.orangeHint}
          days={p.days}
        />
        <ThresholdInput
          color="yellow"
          label={p.yellowLabel}
          value={yellow}
          onChange={setYellow}
          min={orange + 1}
          max={365}
          hint={p.yellowHint}
          days={p.days}
        />
      </div>

      {!isValid && (
        <p className="text-sm text-red-600">{p.invalidThresholds}</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {p.saved}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !isValid}
        className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
      >
        {saving ? p.saving : p.save}
      </button>

      <p className="text-xs text-muted-foreground">{p.saveHint}</p>
    </div>
  );
}

function ThresholdInput({
  color,
  label,
  value,
  onChange,
  min,
  max,
  hint,
  days,
}: {
  color: keyof typeof PRIORITY_COLORS;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint: string;
  days: string;
}) {
  const c = PRIORITY_COLORS[color];
  return (
    <div className={`rounded-xl border p-4 ${c.light} ${c.border}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`w-3 h-3 rounded-full shrink-0 ${c.bg}`} />
        <label className={`text-sm font-medium ${c.text}`}>{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className={`w-20 text-sm font-semibold text-center border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background ${c.border} ${c.text}`}
          />
          <span className={`text-sm ${c.text}`}>{days}</span>
        </div>
        {/* Quick slider */}
        <input
          type="range"
          min={min}
          max={Math.min(max, 365)}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1 min-w-[100px] accent-blue-600 cursor-pointer"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2 ml-6">{hint}</p>
    </div>
  );
}
