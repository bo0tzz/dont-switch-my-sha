import type { Octokit } from '@octokit/rest';
import { getChangedActions } from './diff.js';
import { verifyActions } from './verify.js';
import { postOrDismissReview } from './review.js';
import { log } from './types.js';

export async function handlePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<void> {
  const actions = await getChangedActions(octokit, owner, repo, pullNumber);

  log({
    event: 'webhook_handled',
    owner,
    repo,
    pullNumber,
    actionsFound: actions.length,
  });

  if (actions.length === 0) {
    // No workflow SHA changes — dismiss any previous review if present
    await postOrDismissReview(octokit, owner, repo, pullNumber, []);
    return;
  }

  const results = await verifyActions(octokit, actions);

  for (const result of results) {
    log({
      event: result.verified ? 'sha_verified' : 'sha_unverified',
      owner,
      repo,
      actionRepo: `${result.action.owner}/${result.action.repo}`,
      sha: result.action.sha,
      tier: result.tier ?? null,
    });
  }

  await postOrDismissReview(octokit, owner, repo, pullNumber, results);
}
