# E-signature Abstraction

## Goals

- Native in-platform signature lifecycle with immutable evidence
- Deterministic participant ordering and completion rules
- Clear separation between acknowledgment and jurisdictional legal sufficiency

## Interface

Planned interface methods:

- `createSignatureRequest(payload)`
- `listRequestsForParticipant(personId)`
- `signParticipant(requestId, participantId, consentText)`
- `declineParticipant(requestId, participantId, reason)`
- `cancelRequest(requestId, reason)`
- `computeRequestStatus(requestId)`

## Data model highlights

- SignatureRequest
- SignatureParticipant
- SignatureEvent
- DocumentVersion (locked at request creation)

## Evidence requirements

- signer identity metadata
- timestamps
- signing IP data where legally appropriate
- document hash references
- consent text snapshot

## Legal note

Native signing workflows are tracked with full audit evidence. UI and reports must not represent acknowledgments or signatures as universally sufficient legal signatures without counsel-approved jurisdictional policy.
