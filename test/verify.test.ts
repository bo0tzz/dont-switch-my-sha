import { describe, it, expect, vi } from 'vitest';
import { verifyActions } from '../src/verify.js';
import type { ChangedAction } from '../src/types.js';

const SHA_GOOD = 'a'.repeat(40);
const SHA_BAD = 'b'.repeat(40);
const SHA_TAG_OBJ = 'c'.repeat(40);

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
  refs?: Array<{ ref: string; object: { sha: string; type: string } }>;
  tagResolutions?: Record<string, string>;
  searchCount?: number;
}) {
  const { refs = [], tagResolutions = {}, searchCount = 0 } = options;

  return {
    paginate: {
      iterator: vi.fn().mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield { data: refs };
        },
      })),
    },
    rest: {
      git: {
        listMatchingRefs: {},
        getTag: vi.fn().mockImplementation(({ tag_sha }: { tag_sha: string }) => {
          const commitSha = tagResolutions[tag_sha];
          if (commitSha) {
            return Promise.resolve({
              data: { object: { sha: commitSha } },
            });
          }
          return Promise.reject(new Error('tag not found'));
        }),
      },
      search: {
        commits: vi.fn().mockResolvedValue({
          data: { total_count: searchCount },
        }),
      },
    },
  } as any;
}

describe('verifyActions', () => {
  it('verifies a SHA matching a lightweight tag ref', async () => {
    const octokit = createMockOctokit({
      refs: [
        { ref: 'refs/tags/v4.0.0', object: { sha: SHA_GOOD, type: 'commit' } },
      ],
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('ref');
  });

  it('verifies a SHA matching a branch ref', async () => {
    const octokit = createMockOctokit({
      refs: [
        { ref: 'refs/heads/main', object: { sha: SHA_GOOD, type: 'commit' } },
      ],
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('ref');
  });

  it('resolves annotated tags to find the commit SHA', async () => {
    const octokit = createMockOctokit({
      refs: [
        { ref: 'refs/tags/v4.0.0', object: { sha: SHA_TAG_OBJ, type: 'tag' } },
      ],
      tagResolutions: { [SHA_TAG_OBJ]: SHA_GOOD },
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('ref');
  });

  it('falls back to search API when refs do not match', async () => {
    const octokit = createMockOctokit({
      refs: [
        { ref: 'refs/tags/v3.0.0', object: { sha: 'd'.repeat(40), type: 'commit' } },
      ],
      searchCount: 1,
    });

    const results = await verifyActions(octokit, [makeAction()]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].tier).toBe('search');
    expect(octokit.rest.search.commits).toHaveBeenCalled();
  });

  it('returns unverified when SHA is not found anywhere', async () => {
    const octokit = createMockOctokit({
      refs: [],
      searchCount: 0,
    });

    const results = await verifyActions(octokit, [makeAction({ sha: SHA_BAD })]);

    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(false);
    expect(results[0].tier).toBeUndefined();
  });

  it('deduplicates verification for the same owner/repo@sha', async () => {
    const octokit = createMockOctokit({
      refs: [
        { ref: 'refs/tags/v4.0.0', object: { sha: SHA_GOOD, type: 'commit' } },
      ],
    });

    const actions = [
      makeAction({ path: '.github/workflows/ci.yml', line: 10 }),
      makeAction({ path: '.github/workflows/deploy.yml', line: 5 }),
    ];

    const results = await verifyActions(octokit, actions);

    expect(results).toHaveLength(2);
    expect(results[0].verified).toBe(true);
    expect(results[1].verified).toBe(true);
    // paginate.iterator should only be called once (deduplication)
    expect(octokit.paginate.iterator).toHaveBeenCalledTimes(1);
  });

  it('handles API errors gracefully (treats as unverified)', async () => {
    const octokit = {
      paginate: {
        iterator: vi.fn().mockImplementation(() => ({
          async *[Symbol.asyncIterator]() {
            throw new Error('API rate limit');
          },
        })),
      },
      rest: {
        git: { listMatchingRefs: {} },
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
