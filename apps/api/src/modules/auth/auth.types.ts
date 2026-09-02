export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  personId?: string;
  email: string;
  permissions: string[];
  sessionId?: string;
};
