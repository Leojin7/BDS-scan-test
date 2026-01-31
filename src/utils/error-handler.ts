// src/utils/error-handler.ts
import { inngest } from './queue/security-scan-queue';

export const withErrorHandling = inngest.createFunction(
  {
    id: "error-handling-wrapper",
    retries: {
      max: 3,
      backoff: {
        initialDelay: '1s',
        factor: 2,
        maxDelay: '1m'
      }
    }
  },
  { event: "error/handled" },
  async ({ event, step }) => {
    try {
      // Your operation here
      return { success: true };
    } catch (error) {
      // Log error to your error tracking system
      console.error('Operation failed:', error);

      // You can throw a non-retryable error
      if (error instanceof SomeNonRetryableError) {
        throw new Error('Non-retryable error', { cause: error });
      }

      // Or let Inngest handle the retry
      throw error;
    }
  }
);