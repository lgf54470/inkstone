# Security Policy

## Supported versions

Security fixes target the latest released version and the current default branch. Older revisions may require updating before a fix can be applied.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability. Use the repository's **Security** tab to open a private security advisory and include:

- the affected version or commit;
- the attacker prerequisites and expected impact;
- reproducible steps or a minimal proof of concept;
- any suggested remediation;
- whether the issue affects existing data, backups, sessions, or new-device sign-in.

Please avoid accessing data that is not yours, degrading a production service, or publishing details before a fix is available. Acknowledgement and remediation timing depend on severity and reproducibility.

## Security boundaries

Inkstone is self-hosted software, not a hosted service. Deployment owners are responsible for their Cloudflare account, custom domains, access policies, backup destinations, and timely updates. Inkstone does not provide a password-reset bypass; losing the owner password requires restoring from a trusted backup or reinitializing the instance.

## Sandbox notes

- **S1 (resolved):** Runnable-JS example blocks (`js-example` fenced blocks)
  execute author code inside a dedicated Worker (`js-runner.worker.ts`) that has
  no DOM or parent-page reference; endless loops are stopped by terminating the
  Worker after a timeout. The page CSP no longer contains `'unsafe-eval'`.
  Residual surface: the Worker is same-origin, so example code could still
  reach same-origin `fetch` through indirect global access; common network and
  storage globals are shadowed as defense in depth.

