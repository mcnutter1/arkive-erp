# Equity Ledger Design and Invariants

## Ledger model

Authoritative cap-table state is derived from immutable transactions.

- Append-only transaction entries
- No in-place edits of authoritative totals
- Corrections via reversing/correcting entries linked to originals
- Deterministic recomputation for historical as-of snapshots

## Core transaction fields

- legalEntityId
- effectiveDate
- transactionType
- instrument/security reference
- fromStakeholderId / toStakeholderId
- quantity (decimal)
- unitPrice (decimal)
- currency
- related plan/approval/document references
- externalReference
- ledgerSequence
- createdBy and timestamps
- correctionOfTransactionId

## Invariants

- No negative balances
- Issued shares cannot exceed authorized limits unless blocked with explicit override path
- Exercised quantity cannot exceed exercisable quantity
- Pool reserve balances reconcile
- Live ledger unaffected by scenario modeling
- Every finalized report stores engine version and assumptions hash

## Calculation strategy

- Use decimal math in DB and service layer
- Deterministic ordering by effectiveDate and ledgerSequence
- Event-sourcing style fold functions with invariant checks
- Property-based tests for edge cases and sequence permutations
