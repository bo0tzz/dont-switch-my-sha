import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

export function createOctokit(
  appId: string,
  privateKey: string,
  installationId: number,
): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}
