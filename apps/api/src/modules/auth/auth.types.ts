export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  personId?: string;
  email: string;
  permissions: string[];
  isLocalAdmin?: boolean;
  mustRotatePassword?: boolean;
  sessionId?: string;
};
