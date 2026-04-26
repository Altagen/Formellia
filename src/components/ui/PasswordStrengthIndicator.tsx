"use client";

import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  password: string;
}

export function PasswordStrengthIndicator({ password }: Props) {
  const tr = useTranslations();
  const ps = tr.passwordStrength;

  const RULES = [
    { label: ps.rule8chars,    test: (p: string) => p.length >= 8 },
    { label: ps.ruleUppercase, test: (p: string) => /[A-Z]/.test(p) },
    { label: ps.ruleDigit,     test: (p: string) => /[0-9]/.test(p) },
    { label: ps.ruleSpecial,   test: (p: string) => /[!@#$%^&*()\-_=+[\]{}|;:,.<>?/\\'"~`]/.test(p) },
  ];

  const LEVELS = [
    { label: ps.levelVeryWeak, color: "bg-red-500",    width: "w-1/4" },
    { label: ps.levelWeak,     color: "bg-orange-400", width: "w-2/4" },
    { label: ps.levelMedium,   color: "bg-yellow-400", width: "w-3/4" },
    { label: ps.levelStrong,   color: "bg-green-500",  width: "w-full" },
  ];

  if (!password) return null;

  const passed = RULES.filter(r => r.test(password)).length;
  const level = LEVELS[Math.max(0, passed - 1)];

  return (
    <div className="mt-2 space-y-2">
      {/* Bar */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${level.color} ${level.width}`}
        />
      </div>

      {/* Level label */}
      <p className={`text-xs font-medium ${
        passed <= 1 ? "text-red-500" :
        passed === 2 ? "text-orange-500" :
        passed === 3 ? "text-yellow-600 dark:text-yellow-400" :
        "text-green-600 dark:text-green-400"
      }`}>
        {level.label}
      </p>

      {/* Rule checklist */}
      <ul className="space-y-1">
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} className="flex items-center gap-1.5">
              <svg
                className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${ok ? "text-green-500" : "text-muted-foreground/40"}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className={`text-xs transition-colors ${ok ? "text-foreground" : "text-muted-foreground"}`}>
                {rule.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
