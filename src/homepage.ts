export function getHomepage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Don't Switch my SHA</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.6;
    }
    .container { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; }
    h1 { color: #f0f6fc; font-size: 2.5rem; margin-bottom: 0.5rem; }
    .tagline { color: #8b949e; font-size: 1.2rem; margin-bottom: 2rem; }
    h2 { color: #f0f6fc; font-size: 1.4rem; margin: 2rem 0 0.75rem; }
    p { margin-bottom: 1rem; }
    a { color: #58a6ff; }
    code {
      background: #161b22;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
      color: #e6edf3;
    }
    .install-btn {
      display: inline-block;
      background: #238636;
      color: #fff;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      margin: 1.5rem 0;
    }
    .install-btn:hover { background: #2ea043; }
    .code-block {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 0.9rem;
      margin: 1rem 0;
      color: #e6edf3;
    }
    .warn { color: #d29922; }
    .dim { color: #8b949e; }
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid #21262d;
      color: #8b949e;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Don&rsquo;t Switch my SHA</h1>
    <p class="tagline">A GitHub App that catches fork-based SHA bait-and-switch attacks in your Actions workflows.</p>

    <a href="https://github.com/apps/don-t-switch-my-sha/installations/new" class="install-btn">
      Install on GitHub
    </a>

    <h2>The Problem</h2>
    <p>
      You pin your GitHub Actions to commit SHAs for immutability. Good practice, right?
      But GitHub doesn&rsquo;t verify that a pinned SHA actually belongs to the repository
      in the <code>uses:</code> directive.
    </p>
    <p>
      Because forks share a Git object store with their parent, an attacker can swap in a
      SHA from their malicious fork &mdash; and to a reviewer, it looks like a routine version bump:
    </p>
    <div class="code-block">
      <span class="dim"># Looks like a routine version bump&hellip;</span><br>
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 <span class="dim"># v4.1.1</span><br>
      <span class="warn">+ uses: actions/checkout@&lt;attacker-fork-sha&gt; # v4.1.2</span>
    </div>
    <p>
      The <code>owner/repo</code> looks the same. The version comment says it&rsquo;s a newer release.
      But the SHA points to malicious code in a fork &mdash; and GitHub will happily execute it
      with full access to your repository&rsquo;s secrets.
    </p>

    <h2>How It Works</h2>
    <p>
      When a pull request is opened or updated, this app checks every changed action SHA
      against the claimed repository. It verifies that the commit actually belongs to that
      repo &mdash; not just that it resolves (which fork commits also do).
    </p>
    <p>
      If a SHA can&rsquo;t be verified, the app posts a <strong>changes-requested review</strong>
      with inline comments on the suspicious lines. Add the app as a required reviewer
      in your branch protection rules to make this a hard merge gate.
    </p>
    <p>
      Clean PRs get no noise &mdash; the app only speaks up when something looks wrong.
    </p>

    <a href="https://github.com/apps/don-t-switch-my-sha/installations/new" class="install-btn">
      Install on GitHub
    </a>

    <div class="footer">
      <p>
        Learn more about this attack:
        <a href="https://www.vaines.org/posts/2026-03-24-the-comforting-lie-of-sha-pinning/">The Comforting Lie of SHA Pinning</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
