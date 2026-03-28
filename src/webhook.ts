import { verify } from '@octokit/webhooks-methods';
import { createOctokit } from './github.js';
import { handlePullRequest } from './handler.js';
import type { Env } from './types.js';

export async function handleWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!signature) {
    return new Response('Missing signature', { status: 401 });
  }

  const isValid = await verify(env.GITHUB_WEBHOOK_SECRET, body, signature);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event !== 'pull_request') {
    return new Response('Ignored event', { status: 200 });
  }

  const payload = JSON.parse(body);

  if (payload.action !== 'opened' && payload.action !== 'synchronize') {
    return new Response('Ignored action', { status: 200 });
  }

  const installationId: number | undefined = payload.installation?.id;
  if (!installationId) {
    return new Response('No installation ID', { status: 400 });
  }

  const owner: string = payload.repository.owner.login;
  const repo: string = payload.repository.name;
  const pullNumber: number = payload.pull_request.number;

  try {
    const octokit = createOctokit(
      env.GITHUB_APP_ID,
      env.GITHUB_PRIVATE_KEY,
      installationId,
    );
    await handlePullRequest(octokit, owner, repo, pullNumber);
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response('Internal error', { status: 500 });
  }
}
