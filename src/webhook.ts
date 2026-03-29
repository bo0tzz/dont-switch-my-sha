import { verify } from '@octokit/webhooks-methods';
import { createOctokit } from './github.js';
import { handlePullRequest } from './handler.js';
import type { Env } from './types.js';

function log(data: Record<string, unknown>) {
  console.log(JSON.stringify(data));
}

export async function handleWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!signature) {
    log({ event: 'auth_failure', reason: 'missing_signature' });
    return new Response('Missing signature', { status: 401 });
  }

  const isValid = await verify(env.GITHUB_WEBHOOK_SECRET, body, signature);
  if (!isValid) {
    log({ event: 'auth_failure', reason: 'invalid_signature' });
    return new Response('Invalid signature', { status: 401 });
  }

  const ghEvent = request.headers.get('x-github-event');
  const payload = JSON.parse(body);

  if (ghEvent === 'installation') {
    const account = payload.installation?.account?.login ?? 'unknown';
    const accountType = payload.installation?.account?.type ?? 'unknown';
    const repos = payload.repositories?.map((r: { full_name: string }) => r.full_name) ?? [];
    log({
      event: 'installation',
      action: payload.action,
      account,
      accountType,
      repos,
    });
    return new Response('OK', { status: 200 });
  }

  if (ghEvent !== 'pull_request') {
    log({ event: 'ignored', ghEvent });
    return new Response('Ignored event', { status: 200 });
  }

  if (payload.action !== 'opened' && payload.action !== 'synchronize') {
    log({ event: 'ignored', ghEvent, action: payload.action });
    return new Response('Ignored action', { status: 200 });
  }

  const installationId: number | undefined = payload.installation?.id;
  if (!installationId) {
    log({ event: 'error', reason: 'no_installation_id' });
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
    log({ event: 'error', owner, repo, pullNumber, error: String(error) });
    return new Response('Internal error', { status: 500 });
  }
}
