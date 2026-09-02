import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextValue = {
  requestId: string;
  organizationCode?: string;
  actorUserId?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContextValue>();
