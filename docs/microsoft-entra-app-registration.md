# Microsoft Entra App Registration Guide

## Required setup

- Register a confidential client application for server-side token exchange
- Configure redirect URI for Arkive auth callback
- Restrict sign-in audience to approved tenant(s)
- Record tenant ID and client ID in environment configuration

## Security requirements

- Prefer certificate credentials over long-lived client secrets
- Enforce secret/cert rotation policy
- Restrict exposed scopes to least privilege
