import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { code: 'ARKIVE' },
    update: {},
    create: {
      code: 'ARKIVE',
      name: 'Arkive',
      timezone: 'UTC',
      currency: 'USD',
    },
  });

  await prisma.legalEntity.upsert({
    where: {
      organizationId_legalName: {
        organizationId: org.id,
        legalName: 'Arkive, Inc.',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      legalName: 'Arkive, Inc.',
      shortName: 'Arkive',
      jurisdiction: 'US-DE',
    },
  });

  const permissions = [
    ['system.read', 'System read', 'system', 'read'],
    ['system.manage', 'System manage', 'system', 'manage'],
    ['admin.settings.read', 'Read admin settings', 'admin', 'settings_read'],
    ['admin.settings.write', 'Write admin settings', 'admin', 'settings_write'],
    ['admin.rbac.read', 'Read RBAC settings', 'admin', 'rbac_read'],
    ['admin.rbac.write', 'Write RBAC settings', 'admin', 'rbac_write'],
    ['search.read', 'Global search read', 'search', 'read'],
    ['reports.read', 'Read reports', 'reports', 'read'],
    ['reports.export', 'Export reports', 'reports', 'export'],
    ['access.share.write', 'Manage record shares', 'access', 'share_write'],
    ['people.read', 'People read', 'people', 'read'],
    ['people.write', 'People write', 'people', 'write'],
    ['m365.read', 'M365 read', 'm365', 'read'],
    ['m365.write', 'M365 write', 'm365', 'write'],
    ['equity.read', 'Equity read', 'equity', 'read'],
    ['equity.write', 'Equity write', 'equity', 'write'],
    ['vesting.read', 'Vesting read', 'vesting', 'read'],
    ['documents.read', 'Documents read', 'documents', 'read'],
    ['documents.write', 'Documents write', 'documents', 'write'],
    ['documents.sign.request', 'Create signature requests', 'documents', 'sign_request'],
    ['documents.sign.self', 'Sign assigned documents', 'documents', 'sign_self'],
    ['tasks.write', 'Create and assign tasks', 'tasks', 'write'],
    ['notifications.read.self', 'Read own notifications', 'notifications', 'read_self'],
    ['portal.read.self', 'Read own portal summary', 'portal', 'read_self'],
    ['fundraising.read', 'Fundraising read', 'fundraising', 'read'],
    ['fundraising.write', 'Fundraising write', 'fundraising', 'write'],
    ['scenarios.read', 'Scenarios read', 'scenarios', 'read'],
    ['scenarios.write', 'Scenarios write', 'scenarios', 'write'],
    ['valuations.read', 'Valuations read', 'valuations', 'read'],
    ['valuations.write', 'Valuations write', 'valuations', 'write'],
    ['terminations.write', 'Terminations write', 'terminations', 'write'],
    ['exercises.write', 'Exercises write', 'exercises', 'write'],
    ['approvals.read', 'Approvals read', 'approvals', 'read'],
    ['approvals.write', 'Approvals write', 'approvals', 'write'],
    ['approvals.approve', 'Approvals approve', 'approvals', 'approve'],
  ] as const;

  for (const [code, name, module, action] of permissions) {
    await prisma.permission.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      update: { name, module, action },
      create: { organizationId: org.id, code, name, module, action },
    });
  }

  const roles = [
    ['ADMIN', 'Admin'],
    ['HR', 'HR'],
    ['CONTRACTOR', 'Contractor'],
    ['ADVISOR', 'Advisor'],
    ['EMPLOYEE', 'Employee'],
    ['GUEST', 'Guest'],
  ] as const;

  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      update: { name },
      create: {
        organizationId: org.id,
        code,
        name,
        isSystem: true,
      },
    });
  }

  const rolePermissions: Record<string, string[]> = {
    ADMIN: permissions.map(([code]) => code),
    HR: [
      'people.read',
      'people.write',
      'tasks.read',
      'tasks.write',
      'approvals.read',
      'approvals.write',
      'approvals.approve',
      'documents.read',
      'documents.write',
      'documents.sign.request',
      'documents.sign.self',
      'search.read',
      'm365.read',
      'm365.write',
      'equity.read',
      'equity.write',
      'portal.read.self',
      'notifications.read.self',
    ],
    EMPLOYEE: [
      'portal.read.self',
      'documents.sign.self',
      'tasks.read',
      'notifications.read.self',
    ],
    CONTRACTOR: [
      'portal.read.self',
      'documents.sign.self',
      'tasks.read',
      'notifications.read.self',
    ],
    ADVISOR: [
      'portal.read.self',
      'documents.sign.self',
      'equity.read',
      'fundraising.read',
      'scenarios.read',
      'valuations.read',
      'search.read',
    ],
    GUEST: ['portal.read.self', 'documents.sign.self'],
  };

  const roleByCode = new Map(
    (
      await prisma.role.findMany({
        where: {
          organizationId: org.id,
          code: { in: roles.map(([code]) => code) },
        },
        select: {
          id: true,
          code: true,
        },
      })
    ).map((role) => [role.code, role.id]),
  );

  const permissionByCode = new Map(
    (
      await prisma.permission.findMany({
        where: {
          organizationId: org.id,
        },
        select: {
          id: true,
          code: true,
        },
      })
    ).map((permission) => [permission.code, permission.id]),
  );

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissions)) {
    const roleId = roleByCode.get(roleCode);
    if (!roleId) {
      continue;
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId,
      },
    });

    const createRows = permissionCodes
      .map((permissionCode) => {
        const permissionId = permissionByCode.get(permissionCode);
        if (!permissionId) {
          return null;
        }
        return {
          roleId,
          permissionId,
        };
      })
      .filter((row): row is { roleId: string; permissionId: string } => Boolean(row));

    if (createRows.length > 0) {
      await prisma.rolePermission.createMany({
        data: createRows,
        skipDuplicates: true,
      });
    }
  }

  const departments = ['Engineering', 'Operations', 'People', 'Finance', 'Legal'];
  for (const name of departments) {
    await prisma.department.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }

  const engagementTypes = [
    ['EMPLOYEE', 'Employee'],
    ['CONTRACTOR', 'Contractor'],
    ['ADVISOR', 'Advisor'],
    ['DIRECTOR', 'Director'],
    ['CONSULTANT', 'Consultant'],
    ['INTERN', 'Intern'],
  ] as const;

  for (const [code, name] of engagementTypes) {
    await prisma.engagementType.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      update: { name, isActive: true },
      create: { organizationId: org.id, code, name, isActive: true },
    });
  }

  const featureFlags = [
    ['auth.breakGlass', false],
    ['external.magicLinks', false],
    ['equity.scenarioModeling', true],
  ] as const;

  for (const [key, enabled] of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      update: { enabled },
      create: { organizationId: org.id, key, enabled },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
