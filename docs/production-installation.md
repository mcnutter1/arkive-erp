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
	- If Docker, Docker Compose plugin, or OpenSSL are missing, the installer will install them on Ubuntu automatically.
4. Complete Microsoft Entra app registration.
5. Validate with `scripts/health-check.sh`.

## Image pull troubleshooting

- The stack uses public images from Docker Hub (`postgres`, `redis`, `caddy`, `minio/minio`).
- If `docker compose pull` fails, fix registry/network access first and rerun install.
- MinIO is configured on the `latest` channel in compose; pin to a validated release tag before formal production cutovers.

## Hardening checklist

- Restrict SSH and use key-based auth
- Store secrets in a managed secret store
- Configure scheduled encrypted backups
- Enable SIEM/log forwarding
