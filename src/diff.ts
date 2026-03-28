import parseDiff from 'parse-diff';
import type { Octokit } from '@octokit/rest';
import type { ChangedAction } from './types.js';

const WORKFLOW_PATH_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const USES_SHA_RE =
  /uses:\s+([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/[^\s@]+)?@([0-9a-f]{40})(?:\s+#\s*(.+))?/;

export async function getChangedActions(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<ChangedAction[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const actions: ChangedAction[] = [];

  for (const file of files) {
    if (!WORKFLOW_PATH_RE.test(file.filename) || !file.patch) continue;

    // parse-diff expects full diff headers; prepend minimal ones for the patch
    const diffInput = [
      `diff --git a/${file.filename} b/${file.filename}`,
      `--- a/${file.filename}`,
      `+++ b/${file.filename}`,
      file.patch,
    ].join('\n');

    const parsed = parseDiff(diffInput);

    for (const diffFile of parsed) {
      for (const chunk of diffFile.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;

          const match = change.content.match(USES_SHA_RE);
          if (!match) continue;

          actions.push({
            owner: match[1],
            repo: match[2],
            sha: match[3],
            versionComment: match[4]?.trim(),
            path: file.filename,
            line: change.ln,
          });
        }
      }
    }
  }

  return actions;
}
