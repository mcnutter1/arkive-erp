export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  personId?: string;
  email: string;
  roles?: string[];
  permissions: string[];
  isLocalAdmin?: boolean;
  mustRotatePassword?: boolean;
  sessionId?: string;
};
