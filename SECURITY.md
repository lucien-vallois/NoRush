# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: on the repository's **Security** tab, click **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. Please give the maintainer a chance to fix it before you disclose it.

## What is in scope

- Authentication and roles in the API (JWT, refresh tokens, role checks).
- Device credentials: provisioning, rotation, revocation, and ingestion over HTTP and MQTT.
- The `norush-edge` adapter: its configuration, disk buffer and HTTPS client.
- Anything that lets bad telemetry reach the database, the alerts or the console.

## Known limits

These are documented, not vulnerabilities:

- The demo setup (`npm run setup:demo`, the seed and `docker-compose.yml`) uses development defaults: known demo passwords, an MQTT broker with anonymous access, and admin tools such as pgAdmin. **Never expose the demo to the internet.** For a real install, follow [Production install](docs/production-install.md).
- Device credentials are shared secrets. Per-device certificates (mTLS) and broker topic ACLs are not implemented yet.
- NoRush is not a safety system and has no hazardous-area or SIL certification.

## Supported versions

Only the latest release on `main` gets fixes.
