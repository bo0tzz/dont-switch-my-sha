import { describe, it, expect, vi } from 'vitest';
import { getChangedActions } from '../src/diff.js';

function mockOctokit(files: Array<{ filename: string; patch?: string }>) {
  return {
    paginate: vi.fn().mockResolvedValue(files),
    rest: { pulls: { listFiles: {} } },
  } as any;
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('getChangedActions', () => {
  it('extracts a SHA-pinned action from an added line', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: [
          '@@ -10,7 +10,7 @@',
          '     steps:',
          `-      - uses: actions/checkout@${SHA_A}`,
          `+      - uses: actions/checkout@${SHA_B} # v4.1.0`,
        ].join('\n'),
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      owner: 'actions',
      repo: 'checkout',
      sha: SHA_B,
      versionComment: 'v4.1.0',
      path: '.github/workflows/ci.yml',
    });
    expect(actions[0].line).toBeGreaterThan(0);
  });

  it('ignores non-workflow files', async () => {
    const octokit = mockOctokit([
      {
        filename: 'src/main.ts',
        patch: `@@ -1,1 +1,1 @@\n+uses: actions/checkout@${SHA_A}`,
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(0);
  });

  it('ignores non-SHA refs like @v4', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: [
          '@@ -1,3 +1,3 @@',
          '-      - uses: actions/checkout@v3',
          '+      - uses: actions/checkout@v4',
        ].join('\n'),
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(0);
  });

  it('handles actions with subpaths', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: `@@ -1,1 +1,1 @@\n+      - uses: actions/cache/restore@${SHA_A}`,
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);

    expect(actions).toHaveLength(1);
    expect(actions[0].owner).toBe('actions');
    expect(actions[0].repo).toBe('cache');
  });

  it('ignores docker and local actions', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: [
          '@@ -1,4 +1,4 @@',
          '+      - uses: docker://alpine:3.18',
          '+      - uses: ./local-action',
        ].join('\n'),
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(0);
  });

  it('extracts multiple actions from one file', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: [
          '@@ -1,6 +1,6 @@',
          `+      - uses: actions/checkout@${SHA_A}`,
          '+        with:',
          '+          fetch-depth: 0',
          `+      - uses: actions/setup-node@${SHA_B} # v4.0.0`,
        ].join('\n'),
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);

    expect(actions).toHaveLength(2);
    expect(actions[0].sha).toBe(SHA_A);
    expect(actions[1].sha).toBe(SHA_B);
    expect(actions[1].versionComment).toBe('v4.0.0');
  });

  it('handles .yaml extension', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/deploy.yaml',
        patch: `@@ -1,1 +1,1 @@\n+      - uses: actions/checkout@${SHA_A}`,
      },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(1);
  });

  it('skips files without a patch', async () => {
    const octokit = mockOctokit([
      { filename: '.github/workflows/ci.yml' },
    ]);

    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(0);
  });

  it('only picks up added lines, not deleted lines', async () => {
    const octokit = mockOctokit([
      {
        filename: '.github/workflows/ci.yml',
        patch: [
          '@@ -1,3 +1,3 @@',
          `-      - uses: actions/checkout@${SHA_A}`,
          `+      - uses: actions/checkout@v4`,
        ].join('\n'),
      },
    ]);

    // The deleted line has a SHA but the added line does not (it's a tag ref)
    const actions = await getChangedActions(octokit, 'owner', 'repo', 1);
    expect(actions).toHaveLength(0);
  });
});
