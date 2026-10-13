# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors
working in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Faikout** modules
([faikin.au](https://www.faikin.au), firmware on
[Codeberg](https://codeberg.org/RevK/ESP32-Faikout)): ESP32 boards that replace the Wi-Fi
module of Daikin air conditioners and are driven on the LAN. Local only, no cloud
(`"transports": ["local"]`). Gladys 5.1+ for the scene triggers, scene actions and widgets.

Started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js); CI and
release workflows are the same as [gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/app.test.js                # one file
node --test --test-name-pattern "defrost"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store checks, no image
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks (image
skipped: not built before the release) and a Docker build on pull requests. Releases:
**Actions → Release** only (bumps `package.json`, manifest `version` + `docker_image`, rolls
`CHANGELOG.md`, tags, builds, GitHub Release, then the full store check, image included).

## Architecture

```
index.js                    SDK bootstrap only
src/app.js                  every SDK handler, wired to the unit manager (tests run it as is)
src/config.js               DEFAULT_CONFIG (mirrors the manifest) + the `units` field parser
src/faikout/client.js       one unit: WebSocket ws://<host>/status + GET /common/basic_info
src/faikout/protocol.js     Faikout fields <-> Gladys features, values and control frames
src/faikout/manager.js      all units: polling timer, states, badges, scene events, flush()
src/faikout/store.js        /data/faikout-units.json: MAC, name, model, capabilities per host
src/scenes.js               scene actions (manifest `scene_actions`)
src/widgets.js              dashboard widgets (manifest `widgets`)
src/connection.js           Configuration screen status + "Test the connection"
src/labels.js               words in en/fr/de/es shared by widgets and messages
test/helpers/fakeFaikout.js fake units, fake WebSocket and fetch: no network in tests
```

### How the Faikout is driven

- **WebSocket `/status`** (the one its own web page uses): every frame sent gets exactly
  **one** answer, the full status JSON. An empty frame only reads; a JSON object first
  applies its controls (`{"power":true}`, `{"mode":"H"}`, `{"temp":21.5}`). Answers are not
  tagged, so `FaikoutClient` serializes exchanges. The firmware pushes nothing by itself:
  the integration polls every `poll_frequency` seconds (Gladys never polls these devices).
- The firmware **acks every frame, errors included**: a refused control only shows as an
  unchanged value, hence `frameApplied()` after each command.
- **`/common/basic_info`** (Daikin-compatible) gives the MAC address, read once per host.
- **Web password** (optional, Faikout settings `cookie`): when set, every page and the
  WebSocket want the cookie `Faikout=<password>` (raw value); without it the handshake is
  dropped and HTTP pages answer 200 with a script to `/login` (`LoginRequiredError`). The
  settings password is never needed: it only guards the settings page and the
  `autoe`/`autob`/`autop`/`auto0`/`auto1` settings; `autot`/`autor` are always open.
- Field letters: mode `FHCA456D` (digits unused), fan `A12345Q`. Status fields are absent
  when the unit does not report them, `null` when unknown for now.

### Invariants

- **External ids are forever**: device = `gladys.externalIds('faikout', <mac>)`, feature
  key = the Faikout field name (`power`, `mode`, `temp`, `home`...). Never change either,
  nor the trigger, action, widget, option and output keys users store.
- **Features follow the status**: a feature exists only if the unit reports its field;
  learned capabilities are remembered in `/data`, so a unit off at start-up keeps its
  device. Every feature declares `min`/`max` (NOT NULL in Gladys).
- **States and badges only for devices created in Gladys** (`gladys.devices`);
  `onDeviceCreated` publishes them at once. States go through `publishChangedStates`.
- **Scene events on transitions only**, never on the first reading after a start, never
  for what Gladys itself asked (commands are remembered 2 min), never for set point / mode
  moves made by Faikout auto (`control: true`).
- Publications are batched in `UnitManager.flush()`: devices, transports (≤ 100 per call),
  events, widget nudges — each step independent.
- The container rootfs is read-only: write only under `/data` (`FAIKOUT_DATA_DIR` overrides
  it, for local runs).

### Manifest

`test/manifest.test.js` ties `gladys-assistant-integration.json` to the code: defaults,
handlers for every action / scene action / widget, every trigger declared and fired, event
data keys declared, texts in en/fr/de/es, version and image tag in lockstep.

## Conventions

- **Versions belong to the Release workflow**: never edit `version` in `package.json` or
  the manifest, nor the `docker_image` tag, by hand.
- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow does it.
- **User-facing text is** `{ en, fr, de, es }`: manifest, action messages, widgets, and
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md` stay in sync.
- Prettier formats, ESLint catches mistakes. Comments explain **why**, in English. Tests
  never touch the network.
