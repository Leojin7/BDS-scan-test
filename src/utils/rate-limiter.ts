// src/utils/rate-limiter.ts
import { inngest } from '../queue/security-scan-queue';
import { z } from 'zod';

export const rateLimitedFunction = inngest.createFunction(
  {
    id: "rate-limited-operation",
    // Built-in rate limiting
    rateLimit: {
      limit: 10, // 10 requests
      period: '60s', // per minute
      key: "event.data.userId" // Optional: scope by user
    }
  },
  { event: "api/rate-limited" },
  async ({ event, step }) => {
    // Your rate-limited operation here
    return { success: true };
  }
);