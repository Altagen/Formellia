# YAML reference — forms and dashboard

This document lists the fields accepted by the boot YAML
(`src/lib/yaml/configSchema.ts`) and complements them with the runtime
structures from `src/types/config.ts` for `meta` / `page` / `form` /
`security` / `admin`.

## Root

```yaml
version: 1                    # integer > 0, default 1

app:                          # optional
  enforcePasswordPolicy: true # default false

admin:                        # optional
  email: admin@example.org    # password via the ADMIN_PASSWORD env var

priorityThresholds:           # optional — global fallback
  redMaxDays:    7
  orangeMaxDays: 14
  yellowMaxDays: 30

forms:
  - slug: "/"                 # required, unique
    name: "My form"           # required, label shown in admin
    features: { ... }         # optional
    notifications: { ... }    # optional
    meta: { ... }             # optional — see AppMetaConfig
    page: { ... }             # optional — see PageConfig
    form: { steps: [...] }    # optional — see FormDefinition
    security: { ... }         # optional
    onSubmitActions: [ ... ]  # optional
    customStatuses: [ ... ]   # optional
    successMessage: "..."
    successRedirectUrl: "https://..."
    successRedirectDelay: 5
    priorityThresholds: { redMaxDays, orangeMaxDays, yellowMaxDays }
```

## `forms[].features`

```yaml
features:
  landingPage: true            # false → the public page returns 404
  form:        true            # false → landing visible, form hidden
  blockDisposableEmails: false # rejects disposable email addresses
  formVersioning:        true  # snapshot config changes
  sectionNav:            false # sticky nav based on section_header fields
  completionBar:         false # global progress bar
```

## `forms[].notifications`

```yaml
notifications:
  webhookUrl: "https://..."   # optional — fired fire-and-forget
  enabled:    true            # enables the webhook
  email:                      # confirmation email sent TO THE SUBMITTER
    enabled:     true
    provider:    "resend"     # resend | sendgrid | mailgun
    fromAddress: "noreply@example.org"
    fromName:    "My Service"
    subject:     "Your submission has been received"
    bodyText: |
      Hello {{firstName}},
      We have received your submission.
      Best regards.
```

> **Important**: the `notifications.email` block sends the email TO THE
> SUBMITTER (the address entered in the form's `email` field). It is not an
> "admin notification". The API key (`apiKeyEncrypted` in the runtime type)
> never appears in the YAML — it is read from
> `EMAIL_API_KEY_{SLUG_UPPER}` or `EMAIL_API_KEY` environment variables.
> See [email-setup.md](./email-setup.md).

## `forms[].meta` — `AppMetaConfig`

```yaml
meta:
  name:        "My Service"      # short name (admin sidebar, emails)
  title:       "Submit here"     # HTML title, hero
  description: "..."             # SEO description
  locale:      "en"              # en | fr
  emoji:       "📨"              # optional — sidebar prefix
  translations:                  # optional — overrides UI labels
    submitButton:  "Send"
    nextButton:    "Next"
    backButton:    "Back"
    successTitle:  "Thank you!"
    successMessage: "..."
```

## `forms[].page` — `PageConfig`

```yaml
page:
  branding:
    logoUrl:        "https://..."  # or data: URL ; max 500 KB
    primaryColor:   "#2563eb"
    secondaryColor: "#7c3aed"
    colorPreset:    "indigo"       # overrides the colors above
    defaultTheme:   "light"        # light | dark
    fontFamily:     "inter"        # system | inter | geist | serif

  layout:    "page"        # page | form_only | hero_form_split
  formWidth: "md"          # sm | md | lg | xl | 2xl | full

  nav:
    sticky:  true
    showCta: true
    links:
      - { label: "Home",    href: "/" }
      - { label: "Contact", href: "mailto:contact@..." }

  hero:
    title:             "Annual conference registration"
    subtitle:          "Subtitle"
    eyebrow:           "2026 Edition"  # small badge above the title
    description:       "Introduction text."
    ctaLabel:          "Sign up"
    backgroundVariant: "gradient"      # gradient | solid | image
    backgroundImage:   "https://..."   # required when variant=image
    height:            "normal"        # compact | normal | tall | fullscreen
    textAlign:         "center"        # center | left
    ctaScrollToForm:   true            # smooth scroll to #form
    stats:                              # metrics shown under the description
      - { value: "150+", label: "attendees last year" }

  blocks:
    - { type: "info", title: "...", content: "...", variant: "highlight" }
    - { type: "features", columns: 3, style: "cards", items: [
        { icon: "calendar", title: "...", desc: "..." } ] }
    - { type: "faq", items: [ { question: "...", answer: "..." } ] }
    - { type: "stats", items: [ { value: "200", label: "seats" } ] }
    - { type: "testimonials", items: [ { name: "...", text: "..." } ] }
    - { type: "quote", text: "...", author: "..." }
    - { type: "cta", title: "...", label: "Sign up", scrollToForm: true }
    - { type: "html", content: "<div>...</div>" }
    - { type: "divider" }

  footer:
    text: "© 2026 ..."
    links:
      - { label: "Legal notice", url: "https://..." }
    cguCgv:
      enabled: true
      mode:    "inline"     # inline (Markdown modal) | link (external URL)
      label:   "Terms"
      content: "## Terms of use\n..."   # mode=inline
      url:     "https://..."             # mode=link
```

## `forms[].form` — `FormDefinition`

```yaml
form:
  steps:
    - id: "step-1"
      title: "Your details"
      description: "Fill in these fields."   # optional
      fields:
        - id: "..."  # see types below
```

### Field types (`FieldDef`)

12 types in total, all sharing `id`, `type`, `label`, `placeholder?`,
`required?`, `defaultValue?`, `helpText?`, `validation?`, `visibleWhen?`,
`dbKey?`:

| `type` | Specifics |
|---|---|
| `text` | Plain text input |
| `email` | Email — **`id: "email"`** is extracted into the `submissions.email` column |
| `tel` | Phone number |
| `number` | Numeric |
| `date` | Date — **`id: "dueDate"`** is extracted into `submissions.dueDate` |
| `textarea` | Multi-line |
| `select` | Dropdown. Requires `options: [{ value, label, description? }]` |
| `radio` | Radio buttons. Same options as `select`. |
| `checkbox` | Checkbox (boolean) |
| `section_header` | Visual title only, not submitted, not validated |
| `computed` | Computed read-only field. Requires `formula: { op, ... }`. See DSL below. Optional: `computedUnit`, `computedFormat: number\|date\|text` |
| `alert` | Conditional message (often paired with `visibleWhen`). Requires `alertVariant: info\|warning\|error\|success` |
| `repeater` | Dynamic table. Requires `repeaterColumns: [...]`, optional `repeaterMin` (default 0), `repeaterMax` (default 20), `repeaterAddLabel` |

### `validation`

```yaml
validation:
  min: 0          # number, date
  max: 100
  minLength: 3    # text, textarea, email, tel
  maxLength: 200
  pattern: "^[A-Z]{3}$"
  message: "Expected format: 3 uppercase letters"
```

### `visibleWhen` (conditional visibility)

```yaml
# Single criterion
visibleWhen:
  field:    "isSpeaker"
  operator: "eq"          # eq | neq | in | notIn | gt | gte | lt | lte
  value:    "yes"

# AND
visibleWhen:
  all:
    - { field: "type",  operator: "eq",  value: "pro" }
    - { field: "siret", operator: "neq", value: "" }

# OR
visibleWhen:
  any:
    - { field: "role", operator: "eq", value: "admin" }
    - { field: "role", operator: "eq", value: "owner" }
```

### `formula` (DSL for `computed`)

```yaml
formula:
  op: "date_diff"
  from: "startDate"
  to:   "endDate"
  unit: "days"            # days | months | years

formula:
  op: "date_add"
  base: "receivedAt"
  days: 7                 # number OR id of another field

formula:
  op: "sum"
  fields: ["subtotal", "tax"]

formula:
  op: "field"
  id: "otherField"

formula:
  op: "literal"
  value: "Fixed text"
```

### `repeaterColumns`

```yaml
repeaterColumns:
  - id: "title"
    type: "text"          # text | number | date | select
    label: "Title"
    required: true
    placeholder: "..."
    width: "md"           # sm | md | lg
    validation:           # same schema as a FieldDef (min/max/minLength/maxLength/pattern/message)
      maxLength: 100
  - id: "category"
    type: "select"
    label: "Category"
    options:
      - { value: "a", label: "A" }
```

## `forms[].security`

```yaml
security:
  honeypot:
    enabled: true
    fieldName: "website"   # optional — auto-generated when missing
  rateLimit:
    enabled:    true
    maxPerHour: 10
    maxPerDay:  50
```

## `forms[].onSubmitActions`

Post-submission pipeline. Without this key → default behavior (DB save).

```yaml
onSubmitActions:
  - type: "save_to_db"
    label: "Save"
    enabled: true
  - type: "print_view"
    label: "Generate PDF"
    enabled: true
    config:
      filename: "{{formName}}-{{submittedAt}}.pdf"
```

## `forms[].customStatuses`

Overrides the default statuses (`pending`, `in_progress`, `done`,
`waiting_user`) in the admin.

```yaml
customStatuses:
  - { value: "new",      label: "New",      color: "#6b7280" }
  - { value: "approved", label: "Approved", color: "#059669" }
```

## Dashboard pages (UI restore only)

Analytics pages are **not** accepted by the boot YAML. They go through the
restore endpoint `/api/admin/config/backup`. Format:

```yaml
admin:
  pages:
    - id: "page-stats"
      title: "Registrations"
      slug: "registrations"       # /admin/registrations
      icon: "users"               # Lucide icon name
      formInstanceId: "/"         # filter on this form (id or slug)
      refreshInterval: 60         # auto-refresh in seconds (0 = off)
      interactiveFilter: false    # clicking a segment filters the page
      widgets:
        - { type: "stats_card", id: "...", statsConfig: { ... } }
        - { type: "chart",      id: "...", title: "...", span: 2, chartConfig: { ... } }
        - { type: "stats_table", id: "...", title: "...", tableConfig: { ... } }
        - { type: "submissions_table", id: "...", title: "...", searchFields: [...] }
        # other types listed below
  defaultPage: "registrations"    # /admin redirects here
  tableColumns:                   # columns for the global submissions table
    - { id: "col-email",     label: "Email",     source: "email" }
    - { id: "col-status",    label: "Status",    source: "status" }
    - { id: "col-submitted", label: "Submitted", source: "submittedAt" }
```

### Widget types

| `type` | Required fields (besides `id`) |
|---|---|
| `stats_card` | `statsConfig: { id, title, icon, query, accent? }`. `query` can be a legacy string (`count_total`, `count_today`, `count_week`, `count_overdue`, `count_urgent`, `count_done`) or a parametric `StatsQueryDef`: `{ fn: count\|sum\|avg\|min\|max, field?, filters: [...], filterLogic, scope }` |
| `chart` | `title`, `chartConfig: { id, title, type: bar\|line\|area\|pie, groupBy: date\|status\|priority\|<formData key>, dateRange?, color?, aggregate?, dateField?, showComparison? }` |
| `stats_table` | `tableConfig: { groupBy, columns: [{ id, label, fn, field? }], sortColumnId?, scope?, filters?, ... }` |
| `recent` | `title`, `limit?` (default 5) |
| `info_card` | `title`, `content`, `accent?` |
| `submissions_table` | `title?`, `searchFields?`, `hiddenColumns?` |
| `traffic_chart` | `title?`, `span?` — page views / submissions |
| `email_quality` | `title?` — distribution of email domains |
| `urgency_distribution` | `title?`, `span?` |
| `funnel_chart` | `title?`, `span?`, `stepField`, `maxStep?`, `stepLabels?` |
| `deadline_distribution` | `title?`, `span?`, `dateField?`, `buckets?` |
| `filter_pills` | `title?`, `field` — clickable pills on distinct values |

All accept `span: 1 | 2` (1 = half width, 2 = full width) except
`stats_card`, which always takes 1/4 of a row.

### Available icon names

`icon` fields (page sidebar, `stats_card.statsConfig.icon`) accept a
fixed set of names. Anything outside this list renders a placeholder
in the UI and a `console.warn` in dev builds — it doesn't accept the
full Lucide library to keep the runtime bundle small.

`activity` · `alert-triangle` · `award` · `bar-chart-2` · `calendar` ·
`check-circle` · `clock` · `database` · `file-text` · `gauge` ·
`globe` · `hash` · `heart` · `inbox` · `key` · `lock` · `mail` ·
`mic` · `percent` · `pie-chart` · `server` · `shield` · `star` ·
`tag` · `target` · `timer` · `trending-down` · `trending-up` ·
`user` · `users` · `zap`

To add new ones, extend the `icons` map in
`src/components/dashboard/DynamicWidget.tsx` and import the matching
component from `lucide-react`.
