export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
}

export interface ChangedAction {
  owner: string;
  repo: string;
  sha: string;
  versionComment?: string;
  path: string;
  line: number;
}

export function log(data: Record<string, unknown>) {
  console.log(JSON.stringify(data));
}

export interface VerificationResult {
  action: ChangedAction;
  verified: boolean;
  tier?: 'ref' | 'search';
}
