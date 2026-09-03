export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as
      | {
          message?: string | string[];
          error?:
            | string
            | {
                message?: string;
                details?: unknown;
              };
        }
      | undefined;

    if (!payload) {
      return fallback;
    }

    if (Array.isArray(payload.message) && payload.message.length > 0) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (payload.error && typeof payload.error === 'object') {
      const details = payload.error.details as
        | string
        | { message?: string | string[] }
        | undefined;

      if (typeof details === 'string' && details.trim()) {
        return details;
      }

      if (details && typeof details === 'object') {
        if (Array.isArray(details.message) && details.message.length > 0) {
          return details.message.join(', ');
        }
        if (typeof details.message === 'string' && details.message.trim()) {
          return details.message;
        }
      }

      const nestedMessage = payload.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        if (nestedMessage === 'Request failed' || nestedMessage === 'Internal server error') {
          return fallback;
        }
        return nestedMessage;
      }
    }
  } catch {
    // Ignore parse errors and use fallback.
  }

  return fallback;
}
