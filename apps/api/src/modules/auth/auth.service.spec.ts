import { describe, expect, it } from 'vitest';

import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  it('constructs with config dependency', () => {
    const service = new AuthService({ get: () => undefined } as never);
    expect(service).toBeDefined();
  });
});
