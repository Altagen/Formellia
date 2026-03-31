"use client";

import { FormField } from "@/components/ui/form-field";

interface TextFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
}

export function TextField({
  name,
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
}: TextFieldProps) {
  return (
    <FormField
      id={name}
      name={name}
      type={type}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      placeholder={placeholder}
    />
  );
}
