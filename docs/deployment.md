# Production deployment — VPS checklist

Generic guide for deploying Formellia to a single-host Linux VPS behind
Caddy with Postgres in a sibling container. Tested on Debian 13 with
both Docker Compose v2 and `podman-compose` 1.3.0+.

The `compose` examples assume rootful Podman or Docker; rootless Podman
needs extra port-mapping work that's out of scope here.

## 1. Host prerequisites

- 64-bit Linux with a kernel ≥ 5.10 (containers + IPv6 support)
- A container runtime with Compose: Docker ≥ 20 **or** Podman ≥ 4 with
  `podman-compose` ≥ 1.3
- A public IPv4 (and ideally IPv6) address bound to the host
- DNS records pointing to the host:
  - `A` for the public domain → IPv4
  - `AAAA` for the public domain → IPv6 (only if the network actually
    works end-to-end — see §5)

## 2. Required environment

Create `/srv/formellia/.env` (`chmod 600`, never committed):

```env
POSTGRES_DB=formellia
POSTGRES_USER=formellia
POSTGRES_PASSWORD=<strong random>

AUTH_SECRET=<at least 32 chars, openssl rand -base64 32>
ENCRYPTION_KEY=<exactly 64 hex chars, openssl rand -hex 32>
ADMIN_PASSWORD=<initial admin login>

# Optional — split-domain admin gate
ADMIN_HOST=admin.your-domain.example
TRUSTED_PROXY=true

# Optional — outgoing email (Resend / SendGrid / Mailgun)
EMAIL_API_KEY_ROOT=<provider api key>
```

Required at runtime:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Built from POSTGRES_* in compose; or set explicitly |
| `AUTH_SECRET` | ≥ 32 chars, used for session signing |
| `ENCRYPTION_KEY` | **Exactly 64 hex chars**. Boot fails fast otherwise. |
| `ADMIN_PASSWORD` | Used only on first boot to seed the admin user |

## 3. Compose stack

The shipped `docker-compose.prod.yml` declares three services (`db`,
`app`, `caddy`), a dual-stack network, and named volumes for Postgres
and Caddy data.

Bring it up:

```bash
cd /srv/formellia
sudo docker compose --env-file .env up -d
# or
sudo podman compose --env-file .env up -d
```

`postgres_data`, `caddy_data`, `caddy_config` survive `down`/`up`. They
are deleted only by `down -v`.

## 4. Firewall (ufw on Debian/Ubuntu)

The container bridge needs to reach the host's DNS resolver and the
internet. With ufw's default `INPUT deny` + `FORWARD drop`, container
DNS (aardvark / dnsmasq) and outbound traffic break silently.

```bash
sudo ufw allow 22/tcp        comment 'SSH'
sudo ufw allow 80/tcp        comment 'HTTP (Caddy ACME)'
sudo ufw allow 443/tcp       comment 'HTTPS'
sudo ufw allow 443/udp       comment 'HTTPS/3 (QUIC)'
sudo ufw allow in from 10.89.0.0/24   # Podman default bridge
```

Edit `/etc/default/ufw` and set:

```
DEFAULT_FORWARD_POLICY="ACCEPT"
```

Then `sudo ufw reload`.

## 5. IPv6 — verify before publishing AAAA

Browsers do Happy Eyeballs: if `AAAA` resolves and v6 silently times
out, clients (especially mobile networks) hang for 5–30 s before
falling back. **Always validate v6 reachability before adding the
`AAAA` record.**

After bringing the stack up:

```bash
# From an external host (any v6-capable shell, not the VPS itself —
# many providers don't allow hairpin to their own public IP)
curl -4 -I https://your-domain.example     # must return HTTP/2 200
curl -6 -I https://your-domain.example     # must return HTTP/2 200
```

If `curl -6` times out, either:
- The network's auto-created subnet is IPv4-only — the shipped
  `docker-compose.prod.yml` declares an explicit dual-stack network to
  avoid this. If you customized the file, make sure your override keeps
  `enable_ipv6: true`.
- The host doesn't actually have IPv6 connectivity — check
  `ip -6 route show default` and `curl -6 https://www.google.com`.
- ufw is blocking inbound v6 — check `sudo ufw status verbose`.

If you can't get v6 working immediately, **drop the AAAA record** until
you can. A missing AAAA degrades cleanly; a broken AAAA hangs everyone.

## 6. HTTP/3 / QUIC tuning

Caddy enables HTTP/3 by default. On stock kernels you'll see this
warning at boot:

```
failed to sufficiently increase receive buffer size
(was: 208 kiB, wanted: 7168 kiB, got: 416 kiB)
```

QUIC still works, but performs poorly. Bump kernel buffers permanently:

```bash
sudo tee /etc/sysctl.d/30-quic.conf <<'EOF'
net.core.rmem_max=7500000
net.core.wmem_max=7500000
EOF
sudo sysctl --system
```

Restart Caddy after applying.

## 7. GHCR — pulling a private image

If the published image is private (default for new GHCR packages),
authenticate the runtime once:

```bash
echo "$GHCR_PAT" | sudo docker login ghcr.io -u <gh-user> --password-stdin
# or
echo "$GHCR_PAT" | sudo podman login ghcr.io -u <gh-user> --password-stdin
```

The PAT needs the `read:packages` scope.

To make the package public instead, run **once** as the package owner:

```bash
gh api -X PATCH /user/packages/container/formellia/visibility \
  -f visibility=public
```

## 8. Caddyfile

A working starting point with split-domain admin gating:

```caddy
your-domain.example, admin.your-domain.example {
    encode zstd gzip

    # Block admin paths on the public domain
    @admin path /admin* /api/admin* /api/auth*
    @public host your-domain.example
    handle @admin {
        @public_admin {
            host your-domain.example
        }
        respond @public_admin 404
    }

    reverse_proxy app:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host  {host}
    }
}
```

Run `caddy fmt --overwrite` on it once to silence the formatter
warning at boot.

## 9. Smoke test after deploy

```bash
# Containers up and healthy
sudo docker compose ps

# App finished bootstrap (look for "Done." in startup module)
sudo docker compose logs app | grep '"module":"startup"'

# DB present and migrations applied
sudo docker compose exec db sh -c \
  'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\\dt"'

# Caddy obtained certs
sudo docker compose logs caddy | grep -i "certificate obtained"

# External reachability — both protocols
curl -4 -I https://your-domain.example
curl -6 -I https://your-domain.example
```

If any of these fails, see §5 or the project troubleshooting docs.

## 10. Updating to a new release

```bash
cd /srv/formellia
sudo docker compose pull          # fetch the new image
sudo docker compose up -d         # recreate only what changed
sudo docker compose logs -f app   # watch the new bootstrap

# Optional rollback — pin the image tag in compose to the previous
# version and `up -d` again. Volumes survive.
```

DB migrations run automatically on app start (Drizzle, idempotent).
The first call is wrapped in a bounded retry so the app doesn't crash
if Postgres takes a few seconds to accept connections.
