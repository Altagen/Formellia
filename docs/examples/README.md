# Configuration examples

Concrete, ready-to-adapt use cases.

## Index

| File | Use case |
|---|---|
| [event-signup.yaml](./event-signup.yaml) | Event registration with a conditional repeater for talk proposals. Includes confirmation email through Resend. |
| [event-dashboard.yaml](./event-dashboard.yaml) | Matching analytics page: stats cards, charts, table. |

## How to import an example

### 1. The boot YAML (forms + global settings)

Copy the file as `config.yaml` at the repo root:

```bash
cp docs/examples/event-signup.yaml config.yaml
```

Minimum environment variables in `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/formellia
ENCRYPTION_KEY=<64 hex chars — openssl rand -hex 32>
AUTH_SECRET=<32+ chars — openssl rand -base64 32>
ADMIN_PASSWORD=<at least 8 chars, 1 upper, 1 digit, 1 special>
EMAIL_API_KEY_ROOT=<Resend / SendGrid / Mailgun key>
```

Start (default `db` mode, the YAML acts as a seed):

```bash
podman-compose up -d db
npm run db:migrate
npm run dev
```

### 2. The dashboard YAML (analytics pages)

Once the app is running and the admin is logged in, two options:

**Option A — Through the admin UI**:

1. Go to `/admin/config` (or equivalent — *Configuration* / *Restore* tab).
2. Paste the contents of `event-dashboard.yaml`.
3. Mode: `replace`.
4. Submit.

**Option B — With curl** (requires an admin session):

```bash
# Login to obtain a session cookie
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.org","password":"..."}'

# Restore
curl -b cookies.txt -X POST \
  "http://localhost:3000/api/admin/config/backup?mode=replace" \
  -H "Content-Type: application/x-yaml" \
  --data-binary @docs/examples/event-dashboard.yaml
```
