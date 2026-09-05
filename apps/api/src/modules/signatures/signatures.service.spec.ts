import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { SignaturesService } from './signatures.service.js';

const actor = {
  id: 'user-1',
  organizationId: 'org-1',
  personId: 'person-1',
  permissions: ['documents.sign.self', 'documents.sign.request'],
} as const;

describe('SignaturesService', () => {
  it('records creation locale and requester evidence on native request', async () => {
    const assertDocumentWrite = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({ id: 'sr-1', participants: [] });

    const prisma = {
      documentVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: 'dv-1' }),
      },
      signatureRequest: {
        create,
      },
    } as never;

    const service = new SignaturesService(
      prisma,
      { assertDocumentWrite } as never,
      { createDownloadUrl: vi.fn(), uploadObject: vi.fn() } as never,
    );

    await service.createNativeRequest(
      actor as never,
      {
        documentId: 'doc-1',
        documentVersionId: 'dv-1',
        title: 'Grant Signature Packet',
        participants: [{ personId: 'person-1', signingOrder: 1, role: 'Recipient' }],
      },
      {
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        localeHint: 'US-CA',
      },
    );

    expect(assertDocumentWrite).toHaveBeenCalledWith(actor, 'doc-1');
    const firstCall = create.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = firstCall?.[0]?.data?.events?.create?.payload as { originLocale?: string; originIpAddress?: string };
    expect(payload.originLocale).toBe('US-CA');
    expect(payload.originIpAddress).toBe('203.0.113.10');
  });

  it('captures signed artifact when final participant signs', async () => {
    const signParticipant = {
      id: 'sp-1',
      organizationId: actor.organizationId,
      signatureRequestId: 'sr-1',
      personId: actor.personId,
      signingOrder: 1,
      role: 'Recipient',
      status: 'PENDING',
      signedAt: null,
      declinedReason: null,
      consentText: null,
      ipAddress: null,
      userAgent: null,
      signatureRequest: {
        id: 'sr-1',
        signingOrderRequired: true,
        participants: [{ id: 'sp-1', signingOrder: 1, status: 'PENDING' }],
        events: [{ payload: { originLocale: 'US-CA' } }],
      },
    };

    const txComplete = {
      signatureParticipant: {
        update: vi.fn().mockResolvedValue({ ...signParticipant, status: 'SIGNED' }),
        count: vi.fn().mockResolvedValue(1),
      },
      signatureEvent: {
        create: vi.fn().mockResolvedValue({ id: 'e-1' }),
      },
      signatureRequest: {
        update: vi.fn().mockResolvedValue({ id: 'sr-1', status: 'SIGNED' }),
      },
    };

    const txCapture = {
      documentVersion: {
        findFirst: vi.fn().mockResolvedValue({ versionNumber: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'dv-signed' }),
      },
      document: {
        update: vi.fn().mockResolvedValue({ id: 'doc-1', version: 2 }),
      },
      signatureEvent: {
        create: vi.fn().mockResolvedValue({ id: 'event-captured' }),
      },
    };

    const uploadObject = vi.fn().mockResolvedValue({
      key: 'org-1/2026-09-05/signed-artifacts/artifact.json',
      sha256: 'deadbeef',
      byteSize: 1234,
    });

    const prisma = {
      signatureParticipant: {
        findFirst: vi.fn().mockResolvedValue(signParticipant),
      },
      signatureEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      signatureRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sr-1',
          organizationId: actor.organizationId,
          documentId: 'doc-1',
          title: 'Grant Packet',
          status: 'SIGNED',
          signingOrderRequired: true,
          expiresAt: null,
          document: { id: 'doc-1', title: 'Grant Letter', category: 'grant-letter' },
          documentVersion: {
            id: 'dv-1',
            storageKey: 'org-1/input/grant.md',
            sha256: 'abc123',
            mimeType: 'text/markdown',
            byteSize: 456,
            createdAt: new Date('2026-09-05T00:00:00.000Z'),
          },
          participants: [
            {
              id: 'sp-1',
              personId: actor.personId,
              role: 'Recipient',
              signingOrder: 1,
              status: 'SIGNED',
              signedAt: new Date('2026-09-05T01:00:00.000Z'),
              declinedReason: null,
              consentText: 'I agree',
              ipAddress: '203.0.113.10',
              userAgent: 'Mozilla/5.0',
              person: {
                id: actor.personId,
                legalFirstName: 'Casey',
                legalLastName: 'Signer',
                primaryEmail: 'casey@example.com',
              },
            },
          ],
          events: [
            {
              eventType: 'PARTICIPANT_SIGNED',
              payload: {
                participantId: 'sp-1',
                signatureType: 'DRAWN',
                signerLocale: 'US-CA',
                localeMatch: true,
              },
            },
          ],
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementationOnce(async (fn: (tx: typeof txComplete) => Promise<unknown>) => fn(txComplete))
        .mockImplementationOnce(async (fn: (tx: typeof txCapture) => Promise<unknown>) => fn(txCapture)),
    } as never;

    const service = new SignaturesService(
      prisma,
      { assertDocumentWrite: vi.fn() } as never,
      { createDownloadUrl: vi.fn(), uploadObject } as never,
    );

    const result = await service.completeMySignature(
      actor as never,
      'sp-1',
      {
        consentText: 'I agree',
        signatureType: 'DRAWN',
        drawnSignatureDataUrl: 'data:image/png;base64,AAAA',
        signerLocale: 'US-CA',
      },
      {
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        localeHint: 'US-CA',
      },
    );

    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      artifactCaptured: true,
      signedDocumentVersionId: 'dv-signed',
    });
  });

  it('requires a typed full name when signature type is typed', async () => {
    const service = new SignaturesService(
      {
        signatureParticipant: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'sp-typed',
            personId: actor.personId,
            organizationId: actor.organizationId,
            signingOrder: 1,
            status: 'PENDING',
            signatureRequestId: 'sr-typed',
            signatureRequest: {
              participants: [{ signingOrder: 1, status: 'PENDING' }],
              signingOrderRequired: true,
              events: [],
            },
          }),
        },
      } as never,
      { assertDocumentWrite: vi.fn() } as never,
      { createDownloadUrl: vi.fn(), uploadObject: vi.fn() } as never,
    );

    await expect(
      service.completeMySignature(
        actor as never,
        'sp-typed',
        {
          consentText: 'I agree',
          signatureType: 'TYPED',
          typedFullName: ' ',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
