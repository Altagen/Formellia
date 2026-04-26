/**
 * Substitutes {{varName}} tokens in a template string.
 * Unknown variables are replaced with an empty string.
 */
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Wraps substituted plain text in a minimal, inbox-compatible HTML email.
 * Newlines are converted to <br> tags.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEmailHtml(bodyText: string, vars: Record<string, string>): string {
  const text = substituteVars(bodyText, vars);
  const safe = escapeHtml(text).replace(/\n/g, "<br>");

  // Subject goes into an HTML attribute context — must be fully escaped
  const safeTitle = escapeHtml(substituteVars(vars.subject ?? "", vars));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background-color:#ffffff;border-radius:8px;padding:40px 32px;max-width:600px;width:100%;">
          <tr>
            <td style="font-size:14px;line-height:1.7;color:#111827;">
              ${safe}
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;padding:16px 0;">
          <tr>
            <td align="center" style="font-size:11px;color:#9ca3af;">
              This email was sent automatically, please do not reply.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Returns plain-text version (variable-substituted, no HTML).
 */
export function buildEmailText(bodyText: string, vars: Record<string, string>): string {
  return substituteVars(bodyText, vars);
}
