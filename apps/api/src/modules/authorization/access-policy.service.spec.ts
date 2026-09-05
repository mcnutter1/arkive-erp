import { describe, expect, it, vi } from 'vitest';

import { AccessPolicyService } from './access-policy.service.js';

describe('AccessPolicyService', () => {
  it('allows wildcard permission without requiring record share lookup', async () => {
    const prisma = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'doc-1',
          personId: 'owner-1',
        }),
      },
      recordShare: {
        findFirst: vi.fn(),
      },
    } as never;

    const service = new AccessPolicyService(prisma);

    await expect(
      service.assertDocumentRead(
        {
          id: 'user-1',
          organizationId: 'org-1',
          email: 'admin@example.com',
          permissions: ['*'],
        },
        'doc-1',
      ),
    ).resolves.toBeUndefined();

    expect(prisma.recordShare.findFirst).not.toHaveBeenCalled();
  });

  it('treats WRITE share as valid for READ access', async () => {
    const prisma = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'doc-2',
          personId: 'owner-2',
        }),
      },
      recordShare: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'share-1',
          permission: 'WRITE',
        }),
      },
    } as never;

    const service = new AccessPolicyService(prisma);

    await expect(
      service.assertDocumentRead(
        {
          id: 'user-2',
          organizationId: 'org-1',
          personId: 'person-2',
          email: 'person@example.com',
          permissions: [],
        },
        'doc-2',
      ),
    ).resolves.toBeUndefined();

    expect(prisma.recordShare.findFirst).toHaveBeenCalledTimes(1);
    const firstCall = prisma.recordShare.findFirst.mock.calls[0];
    expect(firstCall?.[0]?.where?.permission).toEqual({ in: ['READ', 'WRITE'] });
  });
});
