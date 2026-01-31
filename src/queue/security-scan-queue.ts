// src/queue/security-scan-queue.ts

import { Inngest } from 'inngest';
import { z } from 'zod';


export const inngest = new Inngest({
  id: "black-duck-security",
  eventKey: process.env.INNGEST_EVENT_KEY,
  //   middleware for logging, retries, etc.
  middleware: [
    {
      onFunctionRun({ fn }) {
        return {
          beforeExecution() {
            console.log(`Starting function: ${fn.name}`);
          },
          async afterExecution({ result }) {
            console.log(`Completed function: ${fn.name}`, { result });
          },
          async onError({ error }) {
            console.error(`Error in function: ${fn.name}`, error);
          }
        };
      }
    }
  ]
});


const securityScanEvent = z.object({
  repoUrl: z.string().url(),
  branch: z.string().default('main'),
  scanType: z.enum(['full', 'incremental', 'dependency-only']).default('full'),
  userId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});


export const securityScan = inngest.createFunction(
  {
    id: "security-scan",

    rateLimit: {
      limit: 10,
      period: '1m',
      key: "event.userId"
    },

    retries: {
      max: 3,
      backoff: {
        initialDelay: '1s',
        factor: 2,
        maxDelay: '1m'
      }
    }
  },
  { event: 'security/scan' },
  async ({ event, step }) => {
    const { repoUrl, branch, scanType } = securityScanEvent.parse(event.data);


    const scanId = await step.run('generate-scan-id', () =>
      `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    );

    const scanner = new securityScan();

    const results = await step.run('execute-scan', async () => {
      return scanner.runScan(repoUrl, branch, scanType);
    });


    const processedVulnerabilities = await Promise.all(
      results.vulnerabilities.map(vuln =>
        step.run(`process-vulnerability-${vuln.id}`, async () => {
          return processVulnerability(vuln);
        })
      )
    );

    const report = await step.run('generate-report', () =>
      generateSecurityReport(processedVulnerabilities)
    );


    if (report.criticalIssues > 0) {
      await step.run('send-critical-alert', () =>
        sendSecurityAlert(report)
      );
    }

    return {
      success: true,
      scanId,
      vulnerabilitiesFound: results.vulnerabilities.length,
      report
    };
  }
);

export async function queueSecurityScan(params: z.infer<typeof securityScanEvent>) {
  return inngest.send({
    name: 'security/scan',
    data: securityScanEvent.parse(params),

    timeout: '30m'
  });
}

inngest.createScheduledFunction(
  'daily-security-scan',
  '0 0 * * *', // Cron expression
  async ({ step }) => {
    const repos = await step.run('fetch-repos', () =>
      fetchAllRepositories()
    );


    await Promise.all(
      repos.map(repo =>
        queueSecurityScan({
          repoUrl: repo.url,
          scanType: 'full',
          userId: 'system'
        })
      )
    );

    return { success: true, reposScanned: repos.length };
  }
);

async function processVulnerability(vulnerability: Vulnerability) {

  return {
    ...vulnerability,
    processedAt: new Date().toISOString(),
    status: 'analyzed'
  };
}