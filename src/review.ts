import type { Octokit } from '@octokit/rest';
import type { VerificationResult } from './types.js';

const BOT_LOGIN = 'dont-switch-my-sha[bot]';

export async function postOrDismissReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  results: VerificationResult[],
): Promise<void> {
  const unverified = results.filter((r) => !r.verified);

  if (unverified.length === 0) {
    await dismissPreviousReview(octokit, owner, repo, pullNumber);
    return;
  }

  await postChangesRequested(octokit, owner, repo, pullNumber, unverified);
}

async function dismissPreviousReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<void> {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const botReview = reviews.find(
    (r) => r.user?.login === BOT_LOGIN && r.state === 'CHANGES_REQUESTED',
  );

  if (botReview) {
    await octokit.rest.pulls.dismissReview({
      owner,
      repo,
      pull_number: pullNumber,
      review_id: botReview.id,
      message: 'All action SHAs now verified.',
    });
  }
}

async function postChangesRequested(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  unverified: VerificationResult[],
): Promise<void> {
  const n = unverified.length;
  const body =
    `## Unverified Action SHA${n > 1 ? 's' : ''} Detected\n\n` +
    `Found ${n} action reference${n > 1 ? 's' : ''} with SHA${n > 1 ? 's' : ''} ` +
    `that could not be verified against the claimed ` +
    `${n > 1 ? 'repositories' : 'repository'}. See inline comments for details.`;

  const comments = unverified.map((result) => ({
    path: result.action.path,
    line: result.action.line,
    side: 'RIGHT' as const,
    body: buildWarning(result),
  }));

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'REQUEST_CHANGES',
    body,
    comments,
  });
}

function buildWarning(result: VerificationResult): string {
  const { owner, repo, sha, versionComment } = result.action;
  const repoRef = `${owner}/${repo}`;

  let msg =
    `**Unverified SHA** — This commit (\`${sha}\`) does not match any branch, tag, ` +
    `or indexed commit in **${repoRef}**.\n\n` +
    `This could indicate a **fork-based SHA bait-and-switch**, where the SHA belongs ` +
    `to a fork rather than the claimed repository. It's also possible (but less likely) ` +
    `that the commit is too new to be indexed.\n\n` +
    `[View this commit on GitHub](https://github.com/${repoRef}/commit/${sha}) — look ` +
    `for the banner: *"This commit does not belong to any branch on this repository, ` +
    `and may belong to a fork outside of the repository."*`;

  if (versionComment) {
    msg +=
      `\n\n**The version comment \`# ${versionComment}\` does not match this SHA.** ` +
      `The tag \`${versionComment}\` resolves to a different commit. This is a strong ` +
      `signal of a bait-and-switch.`;
  }

  return msg;
}
