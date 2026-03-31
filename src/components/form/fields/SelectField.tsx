"use client";

import { useTranslations } from "@/lib/context/LocaleContext";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  error?: string;
}

export function SelectField({
  name,
  label,
  value,
  onChange,
  options,
  error,
}: SelectFieldProps) {
  const tr = useTranslations();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]"
      >
        <option value="">{tr.form.selectPlaceholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
