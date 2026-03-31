import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FormFieldProps extends React.ComponentProps<"input"> {
  label?: string
  error?: string
}

/**
 * Input with built-in label and error message.
 * Drop-in replacement for the old @/components/ui/Input component.
 */
const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, "-")

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <Label htmlFor={fieldId} className="text-sm font-medium">
            {label}
          </Label>
        )}
        <Input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={cn(className)}
          {...props}
        />
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)
FormField.displayName = "FormField"

export { FormField }
