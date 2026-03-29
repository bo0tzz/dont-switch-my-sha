import { describe, it, expect, vi } from 'vitest';
import { verifyActions } from '../src/verify.js';
import type { ChangedAction } from '../src/types.js';

const SHA_GOOD = 'a'.repeat(40);
const SHA_BAD = 'b'.repeat(40);

function makeAction(overrides: Partial<ChangedAction> = {}): ChangedAction {
  return {
    owner: 'actions',
    repo: 'checkout',
    sha: SHA_GOOD,
    path: '.github/workflows/ci.yml',
    line: 10,
    ...overrides,
  };
}

function createMockOctokit(options: {
  tags?: Array<{ commit: { sha: string } }>;
  branches?: Array<{ commit: { sha: string } }>;
  searchCount?: number;
}) {
  const { tags = [], branches = [], searchCount = 0 } = options;

  return {
    paginate: vi.fn().mockImplementation((_endpoint: unknown) => {
      if (_endpoint === mock.rest.repos.listTags) return Promise.resolve(tags);
      if (_endpoint === mock.rest.repos.listBranches) return Promise.resolve(branches);
      return Promise.resolve([]);
    }),
    rest: {
      repos: {
        listTags: {},
        listBranches: {},
      },
      search: {
        commits: vi.fn().mockResolvedValue({
          data: { total_count: searchCount },
        }),
      },
    },
  } as any;

  // Self-reference so the mock implementation can check endpoints
  var mock: any;
  mock = arguments[0];
}

// Build mock with proper self-reference
function buildMockOctokit(options: {
  tags?: Array<{ commit: { sha: string } }>;
  branches?: Array<{ commit: { sha: string } }>;
  searchCount?: number;
}) {
  const { tags = [], branches = [], searchCount = 0 } = options;

  const listTags = Symbol('listTags');
  const listBranches = Symbol('listBranches');

  const octokit = {
    paginate: vi.fn().mockImplementation((endpoint: unknown) => {
      if (endpoint === listTags) return Promise.resolve(tags);
      if (endpoint === listBranches) return Promise.resolve(branches);
      return Promise.resolve([]);
    }),
    rest: {
      repos: {
        listTags,
        listBranches,
      },
      search: {
        commits: vi.fn().mockResolvedValue({
          data: { total_count: searchCount },
        }),
      },
    },
  } as any;

  return octokit;
}

describe('verifyActions', () => {
  it('verifies a SHA matching a tag', async () => {
    const octokit = buildMockOctokit({
      tags: [{ commit: { sha: SHA_GOOD } }],
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('ref');
  });

  it('verifies a SHA matching a branch', async () => {
    const octokit = buildMockOctokit({
      branches: [{ commit: { sha: SHA_GOOD } }],
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('ref');
  });

  it('falls back to search API when refs do not match', async () => {
    const octokit = buildMockOctokit({
      tags: [{ commit: { sha: 'd'.repeat(40) } }],
      searchCount: 1,
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('search');
    expect(octokit.rest.search.commits).toHaveBeenCalled();
  });

  it('returns unverified when SHA is not found anywhere', async () => {
    const octokit = buildMockOctokit({
      searchCount: 0,
    });

    const results = await verifyActions(octokit, [makeAction({ sha: SHA_BAD })]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(false);
    expect(results[0].tier).toBeUndefined();
  });

  it('deduplicates verification for the same owner/repo@sha', async () => {
    const octokit = buildMockOctokit({
      tags: [{ commit: { sha: SHA_GOOD } }],
    });

    const actions = [
      makeAction({ path: '.github/workflows/ci.yml', line: 10 }),
      makeAction({ path: '.github/workflows/deploy.yml', line: 5 }),
    ];

    const results = await verifyActions(octokit, actions);

    expect(results).toHaveLength(2);
    expect(results[0].verified).toBe(true);
    expect(results[1].verified).toBe(true);
    // paginate called once (tags matched, branches skipped) for one unique SHA
    expect(octokit.paginate).toHaveBeenCalledTimes(1);
  });

  it('handles API errors gracefully (treats as unverified)', async () => {
    const octokit = {
      paginate: vi.fn().mockRejectedValue(new Error('API rate limit')),
      rest: {
        repos: { listTags: {}, listBranches: {} },
        search: {
          commits: vi.fn().mockRejectedValue(new Error('rate limit')),
        },
      },
    } as any;

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(false);
  });
});
