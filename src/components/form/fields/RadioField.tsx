"use client";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  error?: string;
}

export function RadioField({
  name,
  label,
  value,
  onChange,
  options,
  error,
}: RadioFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              value === opt.value
                ? "border-blue-500 bg-blue-50"
                : "border-border hover:border-border hover:bg-muted/50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 text-blue-600"
            />
            <div>
              <div className="text-sm font-medium text-foreground">
                {opt.label}
              </div>
              {opt.description && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {opt.description}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
