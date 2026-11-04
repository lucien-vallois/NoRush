# Contributing to NoRush

Thanks for helping. NoRush is built for people who gauge tanks for a living, so field experience counts as much as code: a bug report from a pad, a gauge chart that does not paste, or a register map for a gauge we do not support yet are all welcome.

## Most useful right now

1. **Running `norush-edge` against a live gauge gateway.** The built-in profile has only been tested against the vendor manual's register layout. Open an issue with the *Gauge or gateway report* template and paste the output of `norush-edge check`.
2. **Profiles for other gauges.** If your gauge has a Modbus gateway, a profile is a JSON file: see [Writing a profile](edge/README.md#writing-a-profile).
3. **Field feedback on the console:** wording, units, what a pumper actually needs to see first.

## Set up

Requirements: Node.js 22.20+, npm and Docker Compose.

```bash
npm ci
npm run setup:demo
npm run infra:up
npm run seed
npm run dev        # API with reload + console
npm run simulate   # second terminal: simulated gauges
```

## Before you open a pull request

```bash
npm run check             # builds and unit tests for backend, frontend and edge
npm run smoke             # needs the API and infrastructure running
npm run smoke:telemetry
```

CI runs the same commands on every push and pull request.

## Rules the code keeps

- **Store metric, display either.** The database holds meters and liters. Conversions to ft and bbl happen in the console and in alert messages.
- **Validate before storing.** Invalid telemetry is rejected before it is saved, queued or broadcast.
- **Never show stale data as current.** A gauge that stopped reporting must look like one.
- **Do not overclaim.** NoRush reads and records. It does not control equipment and is not a safety system. Keep docs and UI honest about what was tested.
- **Every UI string in three languages.** Add new keys to `frontend/src/i18n/locales/en.json`, `pt-BR.json` and `es.json`.

## Commits

Short, imperative, with a scope, as in the history:

```
feat(edge): add profile for <gauge>
fix(frontend): keep the interface chart in ft when units are imperial
docs: explain strapping table paste formats
```

## Never commit

- real device credentials (`nrk_…`), JWT secrets or `.env` files;
- operator names, lease or well names, or production numbers from a real site;
- vendor manuals or other copyrighted documents (link to them instead).

## Safety

Do not test hardware in a classified area without the site's permits and procedures. Configure gauges and gateways in a safe area.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
