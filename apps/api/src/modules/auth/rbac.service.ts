import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';

type PermissionTemplate = {
  code: string;
  name: string;
  module: string;
  action: string;
};

type RoleTemplate = {
  code: string;
  name: string;
};

type SectionTemplate = {
  key: string;
  label: string;
  permissionCodes: string[];
  defaultRoleCodes: string[];
};

type SectionRoleRow = {
  section?: unknown;
  roleCodes?: unknown;
};

type SectionRoleSetting = {
  sections?: unknown;
  version?: unknown;
};

export const RBAC_ROLE_TEMPLATES: RoleTemplate[] = [
  { code: 'ADMIN', name: 'Admin' },
  { code: 'HR', name: 'HR' },
  { code: 'CONTRACTOR', name: 'Contractor' },
  { code: 'ADVISOR', name: 'Advisor' },
  { code: 'EMPLOYEE', name: 'Employee' },
  { code: 'GUEST', name: 'Guest' },
];

export const RBAC_ROLE_CODES = RBAC_ROLE_TEMPLATES.map((role) => role.code);

const ROLE_CODE_SET = new Set(RBAC_ROLE_CODES);

const RBAC_PERMISSION_TEMPLATES: PermissionTemplate[] = [
  { code: 'system.read', name: 'System read', module: 'system', action: 'read' },
  { code: 'system.manage', name: 'System manage', module: 'system', action: 'manage' },
  { code: 'admin.settings.read', name: 'Read admin settings', module: 'admin', action: 'settings_read' },
  { code: 'admin.settings.write', name: 'Write admin settings', module: 'admin', action: 'settings_write' },
  { code: 'admin.rbac.read', name: 'Read RBAC settings', module: 'admin', action: 'rbac_read' },
  { code: 'admin.rbac.write', name: 'Write RBAC settings', module: 'admin', action: 'rbac_write' },
  { code: 'search.read', name: 'Global search read', module: 'search', action: 'read' },
  { code: 'reports.read', name: 'Read reports', module: 'reports', action: 'read' },
  { code: 'reports.export', name: 'Export reports', module: 'reports', action: 'export' },
  { code: 'access.share.write', name: 'Manage record shares', module: 'access', action: 'share_write' },
  { code: 'people.read', name: 'People read', module: 'people', action: 'read' },
  { code: 'people.write', name: 'People write', module: 'people', action: 'write' },
  { code: 'm365.read', name: 'M365 read', module: 'm365', action: 'read' },
  { code: 'm365.write', name: 'M365 write', module: 'm365', action: 'write' },
  { code: 'equity.read', name: 'Equity read', module: 'equity', action: 'read' },
  { code: 'equity.write', name: 'Equity write', module: 'equity', action: 'write' },
  { code: 'vesting.read', name: 'Vesting read', module: 'vesting', action: 'read' },
  { code: 'documents.read', name: 'Documents read', module: 'documents', action: 'read' },
  { code: 'documents.write', name: 'Documents write', module: 'documents', action: 'write' },
  {
    code: 'documents.sign.request',
    name: 'Create signature requests',
    module: 'documents',
    action: 'sign_request',
  },
  {
    code: 'documents.sign.self',
    name: 'Sign assigned documents',
    module: 'documents',
    action: 'sign_self',
  },
  { code: 'tasks.read', name: 'Tasks read', module: 'tasks', action: 'read' },
  { code: 'tasks.write', name: 'Tasks write', module: 'tasks', action: 'write' },
  {
    code: 'notifications.read.self',
    name: 'Read own notifications',
    module: 'notifications',
    action: 'read_self',
  },
  { code: 'portal.read.self', name: 'Read own portal summary', module: 'portal', action: 'read_self' },
  { code: 'fundraising.read', name: 'Fundraising read', module: 'fundraising', action: 'read' },
  { code: 'fundraising.write', name: 'Fundraising write', module: 'fundraising', action: 'write' },
  { code: 'scenarios.read', name: 'Scenarios read', module: 'scenarios', action: 'read' },
  { code: 'scenarios.write', name: 'Scenarios write', module: 'scenarios', action: 'write' },
  { code: 'valuations.read', name: 'Valuations read', module: 'valuations', action: 'read' },
  { code: 'valuations.write', name: 'Valuations write', module: 'valuations', action: 'write' },
  { code: 'terminations.write', name: 'Terminations write', module: 'terminations', action: 'write' },
  { code: 'exercises.write', name: 'Exercises write', module: 'exercises', action: 'write' },
  { code: 'approvals.read', name: 'Approvals read', module: 'approvals', action: 'read' },
  { code: 'approvals.write', name: 'Approvals write', module: 'approvals', action: 'write' },
  { code: 'approvals.approve', name: 'Approvals approve', module: 'approvals', action: 'approve' },
];

const RBAC_SECTION_TEMPLATES: SectionTemplate[] = [
  {
    key: 'people',
    label: 'People',
    permissionCodes: ['people.read', 'people.write'],
    defaultRoleCodes: ['ADMIN', 'HR'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    permissionCodes: ['tasks.read', 'tasks.write', 'notifications.read.self'],
    defaultRoleCodes: ['ADMIN', 'HR', 'EMPLOYEE', 'CONTRACTOR', 'ADVISOR'],
  },
  {
    key: 'approvals',
    label: 'Approvals',
    permissionCodes: ['approvals.read', 'approvals.write', 'approvals.approve'],
    defaultRoleCodes: ['ADMIN', 'HR'],
  },
  {
    key: 'portal',
    label: 'Portal',
    permissionCodes: ['portal.read.self', 'documents.sign.self'],
    defaultRoleCodes: ['ADMIN', 'HR', 'EMPLOYEE', 'CONTRACTOR', 'ADVISOR', 'GUEST'],
  },
  {
    key: 'equity',
    label: 'Equity',
    permissionCodes: ['equity.read', 'equity.write', 'vesting.read', 'terminations.write', 'exercises.write'],
    defaultRoleCodes: ['ADMIN', 'HR', 'ADVISOR'],
  },
  {
    key: 'fundraising',
    label: 'Fundraising',
    permissionCodes: [
      'fundraising.read',
      'fundraising.write',
      'scenarios.read',
      'scenarios.write',
      'valuations.read',
      'valuations.write',
      'reports.read',
      'reports.export',
    ],
    defaultRoleCodes: ['ADMIN', 'ADVISOR'],
  },
  {
    key: 'documents',
    label: 'Documents',
    permissionCodes: ['documents.read', 'documents.write', 'documents.sign.request'],
    defaultRoleCodes: ['ADMIN', 'HR', 'EMPLOYEE', 'CONTRACTOR', 'ADVISOR'],
  },
  {
    key: 'search',
    label: 'Search',
    permissionCodes: ['search.read'],
    defaultRoleCodes: ['ADMIN', 'HR'],
  },
  {
    key: 'm365',
    label: 'M365',
    permissionCodes: ['m365.read', 'm365.write'],
    defaultRoleCodes: ['ADMIN', 'HR'],
  },
  {
    key: 'admin',
    label: 'Admin Settings',
    permissionCodes: [
      'admin.settings.read',
      'admin.settings.write',
      'admin.rbac.read',
      'admin.rbac.write',
      'access.share.write',
      'system.read',
      'system.manage',
    ],
    defaultRoleCodes: ['ADMIN'],
  },
];

const RBAC_SETTING_SECTION = 'rbac';
const RBAC_SETTING_KEY = 'sectionRoles';

const MANAGED_PERMISSION_CODES = RBAC_PERMISSION_TEMPLATES.map((permission) => permission.code);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCatalog(organizationId: string): Promise<void> {
    await this.upsertPermissions(organizationId);
    await this.upsertRoles(organizationId);

    const normalized = await this.ensureSectionRoleSetting(organizationId);
    await this.syncRolePermissions(organizationId, normalized);
  }

  async getSectionRoleOverview(organizationId: string) {
    await this.ensureCatalog(organizationId);
    const normalized = await this.readSectionRoleAssignments(organizationId);

    const roles = await this.prisma.role.findMany({
      where: {
        organizationId,
        code: { in: RBAC_ROLE_CODES },
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    return {
      roles,
      sections: RBAC_SECTION_TEMPLATES.map((section) => ({
        key: section.key,
        label: section.label,
        permissions: section.permissionCodes,
        roleCodes: normalized[section.key] ?? [...section.defaultRoleCodes],
      })),
    };
  }

  async updateSectionRoleAssignments(
    organizationId: string,
    updates: Array<{ section: string; roleCodes: string[] }>,
  ) {
    await this.ensureCatalog(organizationId);
    const current = await this.readSectionRoleAssignments(organizationId);

    const merged = { ...current };
    for (const update of updates) {
      const sectionKey = update.section.trim();
      if (!RBAC_SECTION_TEMPLATES.some((section) => section.key === sectionKey)) {
        continue;
      }
      merged[sectionKey] = this.normalizeRoleCodes(update.roleCodes, true);
    }

    await this.writeSectionRoleAssignments(organizationId, merged);
    await this.syncRolePermissions(organizationId, merged);

    return this.getSectionRoleOverview(organizationId);
  }

  private normalizeRoleCodes(codes: unknown, allowEmpty: boolean): string[] {
    if (!Array.isArray(codes)) {
      return [];
    }

    const normalized = unique(
      codes
        .map((value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
        .filter((value) => Boolean(value) && ROLE_CODE_SET.has(value)),
    );

    if (!allowEmpty && normalized.length === 0) {
      return [];
    }

    return normalized;
  }

  private async upsertPermissions(organizationId: string): Promise<void> {
    for (const permission of RBAC_PERMISSION_TEMPLATES) {
      await this.prisma.permission.upsert({
        where: {
          organizationId_code: {
            organizationId,
            code: permission.code,
          },
        },
        update: {
          name: permission.name,
          module: permission.module,
          action: permission.action,
        },
        create: {
          organizationId,
          code: permission.code,
          name: permission.name,
          module: permission.module,
          action: permission.action,
        },
      });
    }
  }

  private async upsertRoles(organizationId: string): Promise<void> {
    for (const role of RBAC_ROLE_TEMPLATES) {
      await this.prisma.role.upsert({
        where: {
          organizationId_code: {
            organizationId,
            code: role.code,
          },
        },
        update: {
          name: role.name,
          isSystem: true,
        },
        create: {
          organizationId,
          code: role.code,
          name: role.name,
          isSystem: true,
        },
      });
    }
  }

  private async ensureSectionRoleSetting(organizationId: string): Promise<Record<string, string[]>> {
    const existing = await this.readSectionRoleAssignments(organizationId);
    let changed = false;

    const normalized: Record<string, string[]> = {};
    for (const section of RBAC_SECTION_TEMPLATES) {
      const assigned = existing[section.key];
      if (assigned) {
        normalized[section.key] = assigned;
      } else {
        normalized[section.key] = [...section.defaultRoleCodes];
        changed = true;
      }
    }

    if (changed || Object.keys(existing).length === 0) {
      await this.writeSectionRoleAssignments(organizationId, normalized);
    }

    return normalized;
  }

  private async readSectionRoleAssignments(organizationId: string): Promise<Record<string, string[]>> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId,
        section: RBAC_SETTING_SECTION,
        key: RBAC_SETTING_KEY,
      },
      select: {
        value: true,
      },
    });

    if (!setting || !setting.value || typeof setting.value !== 'object') {
      return {};
    }

    const value = setting.value as unknown as SectionRoleSetting;
    if (!Array.isArray(value.sections)) {
      return {};
    }

    const rows = value.sections as SectionRoleRow[];
    const normalized: Record<string, string[]> = {};

    for (const section of RBAC_SECTION_TEMPLATES) {
      const row = rows.find((candidate) => candidate.section === section.key);
      if (!row) {
        continue;
      }

      normalized[section.key] = this.normalizeRoleCodes(row.roleCodes, true);
    }

    return normalized;
  }

  private async writeSectionRoleAssignments(
    organizationId: string,
    sectionRoleMap: Record<string, string[]>,
  ): Promise<void> {
    const value = {
      version: 1,
      sections: RBAC_SECTION_TEMPLATES.map((section) => ({
        section: section.key,
        roleCodes: sectionRoleMap[section.key] ?? [],
      })),
    };

    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId,
          section: RBAC_SETTING_SECTION,
          key: RBAC_SETTING_KEY,
        },
      },
      update: {
        value,
      },
      create: {
        organizationId,
        section: RBAC_SETTING_SECTION,
        key: RBAC_SETTING_KEY,
        value,
      },
    });
  }

  private async syncRolePermissions(
    organizationId: string,
    sectionRoleMap: Record<string, string[]>,
  ): Promise<void> {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({
        where: {
          organizationId,
          code: { in: RBAC_ROLE_CODES },
        },
        select: {
          id: true,
          code: true,
        },
      }),
      this.prisma.permission.findMany({
        where: {
          organizationId,
          code: { in: MANAGED_PERMISSION_CODES },
        },
        select: {
          id: true,
          code: true,
        },
      }),
    ]);

    const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
    const permissionIdByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

    const desired = new Set<string>();
    for (const section of RBAC_SECTION_TEMPLATES) {
      const roleCodes = sectionRoleMap[section.key] ?? [];
      for (const roleCode of roleCodes) {
        const roleId = roleIdByCode.get(roleCode);
        if (!roleId) {
          continue;
        }

        for (const permissionCode of section.permissionCodes) {
          const permissionId = permissionIdByCode.get(permissionCode);
          if (!permissionId) {
            continue;
          }
          desired.add(`${roleId}:${permissionId}`);
        }
      }
    }

    const existing = await this.prisma.rolePermission.findMany({
      where: {
        roleId: { in: roles.map((role) => role.id) },
        permissionId: { in: permissions.map((permission) => permission.id) },
      },
      select: {
        roleId: true,
        permissionId: true,
      },
    });

    const existingKeys = new Set(existing.map((item) => `${item.roleId}:${item.permissionId}`));
    const toCreate = [...desired]
      .filter((key) => !existingKeys.has(key))
      .map((key) => {
        const [roleId, permissionId] = key.split(':');
        if (!roleId || !permissionId) {
          return null;
        }
        return {
          roleId,
          permissionId,
        };
      })
      .filter(
        (
          value,
        ): value is {
          roleId: string;
          permissionId: string;
        } => Boolean(value),
      );

    const toDelete = [...existingKeys]
      .filter((key) => !desired.has(key))
      .map((key) => {
        const [roleId, permissionId] = key.split(':');
        return {
          roleId,
          permissionId,
        };
      });

    if (toCreate.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    if (toDelete.length > 0) {
      await this.prisma.rolePermission.deleteMany({
        where: {
          OR: toDelete,
        },
      });
    }
  }
}
