# Production Installation Guide (Ubuntu 26.04)

## Host requirements

- Ubuntu 26.04 LTS
- Docker Engine + Compose plugin
- DNS configured for production domain
- Firewall allowing 80/443 only

## Install flow

1. Clone repository at approved release tag.
2. Configure `.env` from `.env.example`.
3. Run `scripts/install.sh`.
4. Complete Microsoft Entra app registration.
5. Validate with `scripts/health-check.sh`.

## Hardening checklist

- Restrict SSH and use key-based auth
- Store secrets in a managed secret store
- Configure scheduled encrypted backups
- Enable SIEM/log forwarding
