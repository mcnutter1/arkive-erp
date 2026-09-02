# Native E-sign Setup Guide

## Signing model

- Native in-platform signature request lifecycle
- Ordered or parallel signers
- Participant consent text capture
- Signature evidence capture: timestamp, actor identity linkage, optional IP/user-agent metadata

## Setup baseline

- Configure signature policy text and legal disclaimers in Administration
- Configure default signature expiry windows
- Configure signing-order requirement defaults
- Configure immutable document-version locking before signature issuance

## API baseline

- Create request: `POST /api/v1/signatures/requests`
- List own requests: `GET /api/v1/signatures/my-requests`
- Sign request: `POST /api/v1/signatures/participants/:participantId/sign`
- Decline request: `POST /api/v1/signatures/participants/:participantId/decline`

## Legal note

Native signatures and acknowledgments must be reviewed by counsel for jurisdiction-specific legal sufficiency.
