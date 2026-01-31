// src/utils/error-handler.ts
import { inngest } from '../queue/security-scan-queue';

class NonRetryableError extends Error { }

export const withErrorHandling = inngest.createFunction(
  {
    id: "error-handling-wrapper",
    retries: 3
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
      if (error instanceof NonRetryableError) {
        throw new Error('Non-retryable error');
      }

      // Or let Inngest handle the retry
      throw error;
    }
  }
);