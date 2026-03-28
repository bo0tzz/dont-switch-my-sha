import { describe, it, expect, vi } from 'vitest';
import { handlePullRequest } from '../src/handler.js';

const SHA_GOOD = 'a'.repeat(40);
const SHA_BAD = 'b'.repeat(40);

function createMockOctokit(options: {
  files?: Array<{ filename: string; patch?: string }>;
  refs?: Array<{ ref: string; object: { sha: string; type: string } }>;
  searchCount?: number;
  existingReviews?: Array<{ id: number; user: { login: string }; state: string }>;
}) {
  const {
    files = [],
    refs = [],
    searchCount = 0,
    existingReviews = [],
  } = options;

  return {
    paginate: Object.assign(
      vi.fn().mockResolvedValue(files),
      {
        iterator: vi.fn().mockImplementation(() => ({
          async *[Symbol.asyncIterator]() {
            yield { data: refs };
          },
        })),
      },
    ),
    rest: {
      pulls: {
        listFiles: {},
        listReviews: vi.fn().mockResolvedValue({ data: existingReviews }),
        createReview: vi.fn().mockResolvedValue({}),
        dismissReview: vi.fn().mockResolvedValue({}),
      },
      git: {
        listMatchingRefs: {},
        getTag: vi.fn().mockRejectedValue(new Error('not a tag')),
      },
      search: {
        commits: vi.fn().mockResolvedValue({ data: { total_count: searchCount } }),
      },
    },
  } as any;
}

describe('handlePullRequest', () => {
  it('does nothing on a PR with no workflow file changes', async () => {
    const octokit = createMockOctokit({
      files: [{ filename: 'src/index.ts', patch: '+console.log("hi")' }],
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('does not post a review when all SHAs are verified', async () => {
    const octokit = createMockOctokit({
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch: `@@ -1,3 +1,3 @@\n+      - uses: actions/checkout@${SHA_GOOD}`,
        },
      ],
      refs: [
        { ref: 'refs/tags/v4', object: { sha: SHA_GOOD, type: 'commit' } },
      ],
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('posts REQUEST_CHANGES when a SHA is unverified', async () => {
    const octokit = createMockOctokit({
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch: `@@ -1,3 +1,3 @@\n+      - uses: actions/checkout@${SHA_BAD}`,
        },
      ],
      refs: [],
      searchCount: 0,
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    expect(octokit.rest.pulls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'REQUEST_CHANGES',
        pull_number: 1,
      }),
    );

    const call = octokit.rest.pulls.createReview.mock.calls[0][0];
    expect(call.comments).toHaveLength(1);
    expect(call.comments[0].body).toContain('Unverified SHA');
    expect(call.comments[0].body).toContain(SHA_BAD);
  });

  it('dismisses a previous review when a re-push fixes the SHA', async () => {
    const octokit = createMockOctokit({
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch: `@@ -1,3 +1,3 @@\n+      - uses: actions/checkout@${SHA_GOOD}`,
        },
      ],
      refs: [
        { ref: 'refs/tags/v4', object: { sha: SHA_GOOD, type: 'commit' } },
      ],
      existingReviews: [
        {
          id: 42,
          user: { login: 'dont-switch-my-sha[bot]' },
          state: 'CHANGES_REQUESTED',
        },
      ],
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    expect(octokit.rest.pulls.dismissReview).toHaveBeenCalledWith(
      expect.objectContaining({
        review_id: 42,
        pull_number: 1,
      }),
    );
    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('includes version comment warning for unverified SHAs with comments', async () => {
    const octokit = createMockOctokit({
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch: `@@ -1,3 +1,3 @@\n+      - uses: actions/checkout@${SHA_BAD} # v4.1.2`,
        },
      ],
      refs: [],
      searchCount: 0,
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    const call = octokit.rest.pulls.createReview.mock.calls[0][0];
    expect(call.comments[0].body).toContain('v4.1.2');
    expect(call.comments[0].body).toContain('does not match this SHA');
  });
});
