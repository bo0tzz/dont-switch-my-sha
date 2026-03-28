import type { Octokit } from '@octokit/rest';
import { getChangedActions } from './diff.js';
import { verifyActions } from './verify.js';
import { postOrDismissReview } from './review.js';

export async function handlePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<void> {
  const actions = await getChangedActions(octokit, owner, repo, pullNumber);

  if (actions.length === 0) {
    // No workflow SHA changes — dismiss any previous review if present
    await postOrDismissReview(octokit, owner, repo, pullNumber, []);
    return;
  }

  const results = await verifyActions(octokit, actions);
  await postOrDismissReview(octokit, owner, repo, pullNumber, results);
}
