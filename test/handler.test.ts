import { describe, it, expect, vi } from 'vitest';
import { handlePullRequest } from '../src/handler.js';

const SHA_GOOD = 'a'.repeat(40);
const SHA_BAD = 'b'.repeat(40);

function createMockOctokit(options: {
  files?: Array<{ filename: string; patch?: string }>;
  tags?: Array<{ commit: { sha: string } }>;
  searchCount?: number;
  existingReviews?: Array<{ id: number; user: { login: string }; state: string }>;
}) {
  const {
    files = [],
    tags = [],
    searchCount = 0,
    existingReviews = [],
  } = options;

  const listFiles = Symbol('listFiles');
  const listTags = Symbol('listTags');
  const listBranches = Symbol('listBranches');

  return {
    paginate: vi.fn().mockImplementation((endpoint: unknown) => {
      if (endpoint === listFiles) return Promise.resolve(files);
      if (endpoint === listTags) return Promise.resolve(tags);
      if (endpoint === listBranches) return Promise.resolve([]);
      return Promise.resolve([]);
    }),
    rest: {
      pulls: {
        listFiles,
        listReviews: vi.fn().mockResolvedValue({ data: existingReviews }),
        createReview: vi.fn().mockResolvedValue({}),
        dismissReview: vi.fn().mockResolvedValue({}),
      },
      repos: {
        listTags,
        listBranches,
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
      tags: [{ commit: { sha: SHA_GOOD } }],
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
      tags: [],
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
      tags: [{ commit: { sha: SHA_GOOD } }],
      existingReviews: [
        {
          id: 42,
          user: { login: 'some-bot[bot]' },
          state: 'CHANGES_REQUESTED',
          body: '<!-- dont-switch-my-sha -->\n## Unverified Action SHA Detected',
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
      tags: [],
      searchCount: 0,
    });

    await handlePullRequest(octokit, 'owner', 'repo', 1);

    const call = octokit.rest.pulls.createReview.mock.calls[0][0];
    expect(call.comments[0].body).toContain('v4.1.2');
    expect(call.comments[0].body).toContain('does not match this SHA');
  });
});
