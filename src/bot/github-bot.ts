// src/bot/github-bot.ts
import { inngest } from '../queue/security-scan-queue';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { Octokit } from '@octokit/rest';
import type { ScanResult } from '../types/security';

type AutoFixEvent = {
  scanResult: ScanResult & {
    vulnerabilitySignature: number[];
    vulnerabilityDescription: string;
    vulnerableCodeSnippet: string;
    cveId: string;
    vulnerabilityName: string;
    repoOwner: string;
    repoName: string;
    baseSha: string;
    baseBranch: string;
  };
};

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const githubBot = inngest.createFunction(
  { id: "github-bot" },
  { event: "github/auto-fix" },
  async ({ event, step }) => {
    const { scanResult } = (event?.data ?? {}) as AutoFixEvent;

    // Step 1: Find similar vulnerabilities
    const similarIssues = await step.run('find-similar-issues', async () => {
      const pinecone = new Pinecone({ apiKey: requireEnv('PINECONE_API_KEY') });
      const index = pinecone.index('vulnerability-fixes');
      return index.query({
        vector: scanResult.vulnerabilitySignature,
        topK: 5
      });
    });

    // Step 2: Generate fix with OpenAI
    const suggestedFix = await step.run('generate-fix', async () => {
      const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

      return openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a security expert. Fix this vulnerability: ${scanResult.vulnerabilityDescription}`
          },
          {
            role: "user",
            content: `Vulnerable code: ${scanResult.vulnerableCodeSnippet}\n\nSimilar fixes: ${JSON.stringify(similarIssues)}`
          }
        ]
      });
    });

    // Step 3: Create a new branch
    const branchName = `fix/${scanResult.cveId}-${Date.now()}`;
    await step.run('create-branch', async () => {
      const octokit = new Octokit({ auth: requireEnv('GITHUB_TOKEN') });

      return octokit.git.createRef({
        owner: scanResult.repoOwner,
        repo: scanResult.repoName,
        ref: `refs/heads/${branchName}`,
        sha: scanResult.baseSha
      });
    });

    // Step 4: Open a PR
    const pr = await step.run('create-pr', async () => {
      const octokit = new Octokit({ auth: requireEnv('GITHUB_TOKEN') });
      return octokit.pulls.create({
        owner: scanResult.repoOwner,
        repo: scanResult.repoName,
        title: `[Security] Fix ${scanResult.cveId} - ${scanResult.vulnerabilityName}`,
        head: branchName,
        base: scanResult.baseBranch,
        body: `### 🔒 Security Fix\n\n**Vulnerability:** ${scanResult.vulnerabilityName}\n\n**Fix:**\n\`\`\`diff\n${suggestedFix}\n\`\`\``
      });
    });

    return { success: true, prUrl: pr.data.html_url };
  }
);