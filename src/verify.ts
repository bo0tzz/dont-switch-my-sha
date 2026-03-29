import type { Octokit } from '@octokit/rest';
import type { ChangedAction, VerificationResult } from './types.js';

export async function verifyActions(
  octokit: Octokit,
  actions: ChangedAction[],
): Promise<VerificationResult[]> {
  // Deduplicate by (owner, repo, sha)
  const cache = new Map<string, { verified: boolean; tier?: 'ref' | 'search' }>();

  for (const action of actions) {
    const key = `${action.owner}/${action.repo}@${action.sha}`;
    if (!cache.has(key)) {
      cache.set(key, await verifySha(octokit, action.owner, action.repo, action.sha));
    }
  }

  return actions.map((action) => {
    const key = `${action.owner}/${action.repo}@${action.sha}`;
    const result = cache.get(key)!;
    return { action, ...result };
  });
}

async function verifySha(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ verified: boolean; tier?: 'ref' | 'search' }> {
  // Tier 1: check refs (regular API budget)
  if (await checkRefs(octokit, owner, repo, sha)) {
    return { verified: true, tier: 'ref' };
  }

  // Tier 2: search commits API (30 req/min budget)
  if (await searchCommit(octokit, owner, repo, sha)) {
    return { verified: true, tier: 'search' };
  }

  return { verified: false };
}

async function checkRefs(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<boolean> {
  try {
    // listTags and listBranches return commit SHAs directly
    // (no annotated tag resolution needed)
    const tags = await octokit.paginate(octokit.rest.repos.listTags, {
      owner,
      repo,
      per_page: 100,
    });
    if (tags.some((tag) => tag.commit.sha === sha)) return true;

    const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
      owner,
      repo,
      per_page: 100,
    });
    if (branches.some((branch) => branch.commit.sha === sha)) return true;

    return false;
  } catch {
    return false;
  }
}

async function searchCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<boolean> {
  try {
    const { data } = await octokit.rest.search.commits({
      q: `hash:${sha} repo:${owner}/${repo}`,
    });
    return data.total_count > 0;
  } catch {
    return false;
  }
}
