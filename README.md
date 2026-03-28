# Don't Switch my SHA

Catches fork-based SHA bait-and-switch attacks in GitHub Actions workflows.

## The Problem

GitHub Actions workflows commonly pin third-party actions to commit SHAs for immutability. But GitHub doesn't verify that a pinned SHA belongs to the repository in the `uses:` directive.

Because forks share a Git object store with their parent, an attacker can:

1. Fork a legitimate action repository
2. Add malicious code in their fork
3. Submit a PR that changes only the pinned SHA — the `owner/repo` stays the same

To a reviewer, this looks like a routine version bump. The workflow executes the attacker's code with full access to the repository's secrets.

```diff
# Looks like a version bump...
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
+ uses: actions/checkout@<attacker-fork-sha> # v4.1.2
```

For the full background, see [The Comforting Lie of SHA Pinning](https://www.vaines.org/posts/2026-03-24-the-comforting-lie-of-sha-pinning/).

## How It Works

When a pull request is opened or updated, the app:

1. Checks the PR diff for changes to `.github/workflows/*.yml` files
2. Extracts any `uses:` lines with 40-character SHA pins
3. Verifies each SHA against the claimed repository using a two-tier approach:
   - **Tier 1:** Checks all refs (tags and branches) via the GitHub Refs API
   - **Tier 2:** Falls back to the Search Commits API, which only indexes commits reachable from a repository's own refs
4. Posts results as a PR review:
   - **All SHAs verified:** no review (no noise on clean PRs)
   - **Any SHA unverified:** `REQUEST_CHANGES` review with inline comments on the flagged lines

## Blocking Merges

Because results are posted as a `REQUEST_CHANGES` review, you can add the app as a **required reviewer** in your branch protection rules to make it a hard merge gate.

## Install

**[Install on GitHub](https://github.com/apps/don-t-switch-my-sha/installations/new)**

The app requires these repository permissions:
- **Contents:** Read (to access PR diffs)
- **Pull requests:** Read & write (to post reviews)

## Self-Hosting

The app runs as a Cloudflare Worker. To self-host:

1. Clone this repo
2. `npm install`
3. Create a [GitHub App](https://docs.github.com/en/apps/creating-github-apps) with the permissions above, subscribing to the **Pull request** event
4. Set your Worker secrets:
   ```
   wrangler secret put GITHUB_APP_ID
   wrangler secret put GITHUB_WEBHOOK_SECRET
   wrangler secret put GITHUB_PRIVATE_KEY
   ```
5. Deploy: `npm run deploy`

## Development

```
npm install
npm run dev      # start local dev server
npm test         # run tests
```
