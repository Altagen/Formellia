/**
 * Mapping from raw audit action codes to human-readable labels + visual kind.
 *
 * The dictionary is grouped by domain. For each code we provide :
 *   - `label`  : short FR description shown in the timeline title
 *   - `kind`   : visual category (drives the icon + color in the UI)
 *   - `icon`   : Lucide icon name
 *   - `danger` : true for destructive actions (red border-left)
 *
 * When a code is not found, the UI falls back to displaying the raw code with
 * a neutral "default" kind.
 */

export type AuditKind = "config" | "form" | "view" | "email" | "data" | "auth" | "danger" | "default";

export interface AuditLabel {
  label: string;
  kind: AuditKind;
  icon: string; // lucide name (use with dynamic import or icon registry)
  danger?: boolean;
}

const LABELS_FR: Record<string, AuditLabel> = {
  // ── config.* ───────────────────────────────────────────────────────────
  "config.update":               { label: "Configuration modifiée",            kind: "config", icon: "Settings" },
  "config.reset":                { label: "Configuration réinitialisée",       kind: "config", icon: "RotateCcw" },
  "config.restore":              { label: "Configuration restaurée",           kind: "config", icon: "Undo2" },
  "config.import":               { label: "Configuration importée",            kind: "config", icon: "Upload" },
  "config.yaml":                 { label: "Export YAML de la configuration",   kind: "config", icon: "FileCode" },
  "config.auto_page.create":     { label: "Vue auto-générée pour formulaire",  kind: "view",   icon: "LayoutDashboard" },
  "config.auto_pages.backfill":  { label: "Vues auto-générées (backfill)",     kind: "view",   icon: "LayoutDashboard" },

  // ── form.* ─────────────────────────────────────────────────────────────
  "form.create":                 { label: "Formulaire créé",                   kind: "form",   icon: "FileText" },
  "form.update":                 { label: "Formulaire modifié",                kind: "form",   icon: "FileText" },
  "form.delete":                 { label: "Formulaire supprimé",               kind: "form",   icon: "Trash2", danger: true },
  "form.duplicate":              { label: "Formulaire dupliqué",               kind: "form",   icon: "Copy" },
  "form.import":                 { label: "Formulaire importé",                kind: "form",   icon: "Upload" },
  "form.unlock":                 { label: "Formulaire déverrouillé",           kind: "form",   icon: "Unlock" },
  "form.notifications_update":   { label: "Notifications du formulaire mises à jour", kind: "config", icon: "Bell" },

  // ── email.* ────────────────────────────────────────────────────────────
  "email.broadcast.draft":       { label: "Brouillon de diffusion créé",       kind: "email",  icon: "FileEdit" },
  "email.broadcast.update":      { label: "Diffusion modifiée",                kind: "email",  icon: "Mail" },
  "email.broadcast.send":        { label: "Diffusion envoyée",                 kind: "email",  icon: "Send" },
  "email.broadcast.send.failed": { label: "Échec d'envoi de diffusion",        kind: "email",  icon: "MailWarning", danger: true },
  "email.broadcast.delete":      { label: "Diffusion supprimée",               kind: "email",  icon: "Trash2", danger: true },
  "email.provider.update":       { label: "Provider d'envoi mis à jour",       kind: "email",  icon: "Mail" },

  // ── datapool.* ─────────────────────────────────────────────────────────
  "datapool.create":             { label: "DataPool créé",                     kind: "data",   icon: "Database" },
  "datapool.update":             { label: "DataPool modifié",                  kind: "data",   icon: "Database" },
  "datapool.delete":             { label: "DataPool supprimé",                 kind: "data",   icon: "Trash2", danger: true },
  "datapool.export":             { label: "DataPool exporté",                  kind: "data",   icon: "Download" },
  "datapool.exclusion.add":      { label: "Exclusion ajoutée au DataPool",     kind: "data",   icon: "MinusCircle" },
  "datapool.exclusion.remove":   { label: "Exclusion retirée du DataPool",     kind: "data",   icon: "PlusCircle" },

  // ── backup.* ───────────────────────────────────────────────────────────
  "backup.run":                  { label: "Backup exécuté",                    kind: "config", icon: "Archive" },
  "backup.yaml":                 { label: "Backup YAML généré",                kind: "config", icon: "FileArchive" },
  "backup.restore":              { label: "Restauration depuis un backup",     kind: "config", icon: "Undo2" },
  "backup.provider.create":      { label: "Provider de backup créé",           kind: "config", icon: "Plus" },
  "backup.provider.update":      { label: "Provider de backup modifié",        kind: "config", icon: "Settings" },
  "backup.provider.delete":      { label: "Provider de backup supprimé",       kind: "config", icon: "Trash2", danger: true },

  // ── user.* ─────────────────────────────────────────────────────────────
  "user.create":                 { label: "Compte créé",                       kind: "auth",   icon: "UserPlus" },
  "user.delete":                 { label: "Compte supprimé",                   kind: "auth",   icon: "UserMinus", danger: true },
  "user.role_change":            { label: "Rôle modifié",                      kind: "auth",   icon: "Shield" },
  "user.grants.update":          { label: "Accès aux formulaires modifiés",    kind: "auth",   icon: "Shield" },
  "user.password_change":        { label: "Mot de passe changé",               kind: "auth",   icon: "Key" },
  "user.reset_token_generated":  { label: "Token de réinitialisation généré",  kind: "auth",   icon: "Key" },
  "user.temp_password":          { label: "Mot de passe temporaire émis",      kind: "auth",   icon: "Key" },

  // ── folder.* / view.* ──────────────────────────────────────────────────
  "folder.create":               { label: "Dossier créé",                      kind: "config", icon: "Plus" },
  "folder.delete":               { label: "Dossier supprimé",                  kind: "config", icon: "Trash2", danger: true },
  "view.import":                 { label: "Vue importée",                      kind: "view",   icon: "Upload" },

  // ── dataset.* ──────────────────────────────────────────────────────────
  "dataset.create":              { label: "Dataset créé",                      kind: "data",   icon: "Database" },
  "dataset.update":              { label: "Dataset modifié",                   kind: "data",   icon: "Database" },
  "dataset.delete":              { label: "Dataset supprimé",                  kind: "data",   icon: "Trash2", danger: true },
  "dataset.import":              { label: "Dataset importé",                   kind: "data",   icon: "Upload" },
  "dataset.import.batch":        { label: "Datasets importés (lot)",           kind: "data",   icon: "Upload" },

  // ── jobs.* / audit.* / settings.* / system.* ───────────────────────────
  "jobs.import":                 { label: "Tâches planifiées importées",       kind: "config", icon: "Upload" },
  "audit.purge":                 { label: "Purge du journal d'audit",          kind: "danger", icon: "Trash2", danger: true },
  "settings.update":             { label: "Paramètres généraux modifiés",      kind: "config", icon: "Settings" },
  "system.reencrypt":            { label: "Ré-encryption des secrets",         kind: "danger", icon: "Key", danger: true },

  // ── session.* / apikey.* ───────────────────────────────────────────────
  "session.revoke":              { label: "Session révoquée",                  kind: "auth",   icon: "Unlock", danger: true },
  "session.revoke_all":          { label: "Toutes les sessions révoquées",     kind: "danger", icon: "Unlock", danger: true },
  "apikey.create":               { label: "Clé API créée",                     kind: "auth",   icon: "Key" },
  "apikey.revoke":               { label: "Clé API révoquée",                  kind: "auth",   icon: "Trash2", danger: true },

  // ── email.provider (CRUD) ──────────────────────────────────────────────
  "email.provider.create":       { label: "Provider d'envoi créé",             kind: "email",  icon: "Plus" },
  "email.provider.delete":       { label: "Provider d'envoi supprimé",         kind: "email",  icon: "Trash2", danger: true },
  "email.provider.set_default":  { label: "Provider par défaut modifié",       kind: "email",  icon: "Mail" },

  // ── account.* (self-service) ───────────────────────────────────────────
  "account.email_change":              { label: "Email du compte modifié",         kind: "auth", icon: "Key" },
  "account.recovery_codes_generated":  { label: "Codes de récupération générés",   kind: "auth", icon: "Key" },
  "account.recovery_codes_cleared":    { label: "Codes de récupération supprimés", kind: "auth", icon: "Trash2", danger: true },
  "account.recovery_code_used":        { label: "Code de récupération utilisé",    kind: "auth", icon: "Key" },
};

const LABELS_EN: Record<string, AuditLabel> = {
  "config.update":               { label: "Configuration updated",             kind: "config", icon: "Settings" },
  "config.reset":                { label: "Configuration reset",               kind: "config", icon: "RotateCcw" },
  "config.restore":              { label: "Configuration restored",            kind: "config", icon: "Undo2" },
  "config.import":               { label: "Configuration imported",            kind: "config", icon: "Upload" },
  "config.yaml":                 { label: "Configuration YAML export",         kind: "config", icon: "FileCode" },
  "config.auto_page.create":     { label: "View auto-generated for form",      kind: "view",   icon: "LayoutDashboard" },
  "config.auto_pages.backfill":  { label: "Views auto-generated (backfill)",   kind: "view",   icon: "LayoutDashboard" },
  "form.create":                 { label: "Form created",                      kind: "form",   icon: "FileText" },
  "form.update":                 { label: "Form updated",                      kind: "form",   icon: "FileText" },
  "form.delete":                 { label: "Form deleted",                      kind: "form",   icon: "Trash2", danger: true },
  "form.duplicate":              { label: "Form duplicated",                   kind: "form",   icon: "Copy" },
  "form.import":                 { label: "Form imported",                     kind: "form",   icon: "Upload" },
  "form.unlock":                 { label: "Form unlocked",                     kind: "form",   icon: "Unlock" },
  "form.notifications_update":   { label: "Form notifications updated",        kind: "config", icon: "Bell" },
  "email.broadcast.draft":       { label: "Broadcast draft created",           kind: "email",  icon: "FileEdit" },
  "email.broadcast.update":      { label: "Broadcast updated",                 kind: "email",  icon: "Mail" },
  "email.broadcast.send":        { label: "Broadcast sent",                    kind: "email",  icon: "Send" },
  "email.broadcast.send.failed": { label: "Broadcast send failed",             kind: "email",  icon: "MailWarning", danger: true },
  "email.broadcast.delete":      { label: "Broadcast deleted",                 kind: "email",  icon: "Trash2", danger: true },
  "email.provider.update":       { label: "Email provider updated",            kind: "email",  icon: "Mail" },
  "datapool.create":             { label: "DataPool created",                  kind: "data",   icon: "Database" },
  "datapool.update":             { label: "DataPool updated",                  kind: "data",   icon: "Database" },
  "datapool.delete":             { label: "DataPool deleted",                  kind: "data",   icon: "Trash2", danger: true },
  "datapool.export":             { label: "DataPool exported",                 kind: "data",   icon: "Download" },
  "datapool.exclusion.add":      { label: "DataPool exclusion added",          kind: "data",   icon: "MinusCircle" },
  "datapool.exclusion.remove":   { label: "DataPool exclusion removed",        kind: "data",   icon: "PlusCircle" },
  "backup.run":                  { label: "Backup executed",                   kind: "config", icon: "Archive" },
  "backup.yaml":                 { label: "YAML backup generated",             kind: "config", icon: "FileArchive" },
  "backup.restore":              { label: "Restore from backup",               kind: "config", icon: "Undo2" },
  "backup.provider.create":      { label: "Backup provider created",           kind: "config", icon: "Plus" },
  "backup.provider.update":      { label: "Backup provider updated",           kind: "config", icon: "Settings" },
  "backup.provider.delete":      { label: "Backup provider deleted",           kind: "config", icon: "Trash2", danger: true },
  "user.create":                 { label: "Account created",                   kind: "auth",   icon: "UserPlus" },
  "user.delete":                 { label: "Account deleted",                   kind: "auth",   icon: "UserMinus", danger: true },
  "user.role_change":            { label: "Role changed",                      kind: "auth",   icon: "Shield" },
  "user.grants.update":          { label: "Form grants updated",               kind: "auth",   icon: "Shield" },
  "user.password_change":        { label: "Password changed",                  kind: "auth",   icon: "Key" },
  "user.reset_token_generated":  { label: "Reset token generated",             kind: "auth",   icon: "Key" },
  "user.temp_password":          { label: "Temporary password issued",         kind: "auth",   icon: "Key" },
  "folder.create":               { label: "Folder created",                    kind: "config", icon: "Plus" },
  "folder.delete":               { label: "Folder deleted",                    kind: "config", icon: "Trash2", danger: true },
  "view.import":                 { label: "View imported",                     kind: "view",   icon: "Upload" },
  "dataset.create":              { label: "Dataset created",                   kind: "data",   icon: "Database" },
  "dataset.update":              { label: "Dataset updated",                   kind: "data",   icon: "Database" },
  "dataset.delete":              { label: "Dataset deleted",                   kind: "data",   icon: "Trash2", danger: true },
  "dataset.import":              { label: "Dataset imported",                  kind: "data",   icon: "Upload" },
  "dataset.import.batch":        { label: "Datasets imported (batch)",         kind: "data",   icon: "Upload" },
  "jobs.import":                 { label: "Scheduled jobs imported",           kind: "config", icon: "Upload" },
  "audit.purge":                 { label: "Audit log purge",                   kind: "danger", icon: "Trash2", danger: true },
  "settings.update":             { label: "General settings updated",          kind: "config", icon: "Settings" },
  "system.reencrypt":            { label: "Secret re-encryption",              kind: "danger", icon: "Key", danger: true },
  "session.revoke":              { label: "Session revoked",                   kind: "auth",   icon: "Unlock", danger: true },
  "session.revoke_all":          { label: "All sessions revoked",              kind: "danger", icon: "Unlock", danger: true },
  "apikey.create":               { label: "API key created",                   kind: "auth",   icon: "Key" },
  "apikey.revoke":               { label: "API key revoked",                   kind: "auth",   icon: "Trash2", danger: true },
  "email.provider.create":       { label: "Email provider created",            kind: "email",  icon: "Plus" },
  "email.provider.delete":       { label: "Email provider deleted",            kind: "email",  icon: "Trash2", danger: true },
  "email.provider.set_default":  { label: "Default email provider changed",    kind: "email",  icon: "Mail" },
  "account.email_change":              { label: "Account email changed",           kind: "auth", icon: "Key" },
  "account.recovery_codes_generated":  { label: "Recovery codes generated",        kind: "auth", icon: "Key" },
  "account.recovery_codes_cleared":    { label: "Recovery codes cleared",          kind: "auth", icon: "Trash2", danger: true },
  "account.recovery_code_used":        { label: "Recovery code used",              kind: "auth", icon: "Key" },
};

const DEFAULT_LABEL: AuditLabel = { label: "", kind: "default", icon: "Activity" };

export function getAuditLabel(code: string, locale: "fr" | "en" = "fr"): AuditLabel {
  const dict = locale === "en" ? LABELS_EN : LABELS_FR;
  return dict[code] ?? LABELS_FR[code] ?? { ...DEFAULT_LABEL, label: code };
}
