# Faikout — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to
**Daikin air conditioners fitted with a [Faikout](https://www.faikin.au) module** — the
open-source ESP32 board by RevK that replaces Daikin's Wi-Fi module and is driven on your
own network, with no cloud.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md).

## What it does

- **Local only** (`"transports": ["local"]`): Gladys talks to each Faikout over the LAN,
  nothing goes through the Internet.
- **One device per air conditioner**, keyed by the module's MAC address, with the
  features its unit actually reports: power, mode, set point, fan speed, swing, Econo,
  Powerful, Comfort, Streamer, quiet outdoor unit, room / outside / inlet / refrigerant
  temperatures, humidity, power consumption.
- **Transport badge**: local, degraded (the air conditioner does not answer its Faikout),
  unreachable.
- **Scene triggers** (Gladys 5.1+): goes offline or comes back, changed outside Gladys
  (IR remote, Faikout page, timer), defrost started or ended.
- **Scene actions**: set an air conditioner (power, mode, set point, fan in one go), set
  Faikout auto (target ± range), read an air conditioner (fresh values as outputs).
- **Dashboard widgets**: one air conditioner (live tiles, 24 h temperature chart, status, On/Off), and an overview
  of all units.

## How it talks to the hardware

Two endpoints of the Faikout web server, the ones its own web page uses:

| Endpoint                          | Use                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ws://<host>/status`              | Every frame gets one answer, the full status JSON. Empty frame: read. JSON frame: apply controls, then answer. |
| `http://<host>/common/basic_info` | Daikin-compatible info page: the MAC address, read once per unit.                                              |

Each unit is read every `poll_frequency` seconds (30 by default). Commands from Gladys
are sent at once and checked against the status the unit answers with.

## Project structure

```
├─ index.js                          # SDK bootstrap
├─ src/
│  ├─ app.js                         # SDK handlers -> unit manager
│  ├─ config.js                      # defaults + parser of the "Faikout units" field
│  ├─ connection.js                  # connection status + "Test the connection"
│  ├─ labels.js                      # bilingual words
│  ├─ scenes.js                      # scene actions
│  ├─ widgets.js                     # dashboard widgets
│  └─ faikout/
│     ├─ client.js                   # WebSocket + basic_info of one unit
│     ├─ manager.js                  # all units: polling, states, badges, events
│     ├─ protocol.js                 # Faikout fields <-> Gladys features
│     └─ store.js                    # what is remembered in /data
├─ test/                             # node --test, fake Gladys + fake Faikout units
├─ docs/en.md, docs/fr.md            # user documentation (mandatory for the store)
├─ gladys-assistant-integration.json # manifest
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22/24), store checks, Docker build
├─ .github/workflows/build.yml       # multi-arch image (amd64 + arm64) to ghcr.io
├─ .github/workflows/release.yml     # one-click release from the Actions tab
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/changelog-release.mjs # rolls CHANGELOG.md at release time
├─ .github/dependabot.yml            # npm weekly, Actions and Docker monthly
└─ cover.png                         # catalog cover, 800×534 px
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="faikout" \
FAIKOUT_DATA_DIR=/tmp/gladys-faikout \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the integration
runs inside its sandboxed container. `FAIKOUT_DATA_DIR` replaces `/data`, the only
writable path in the container.

## Quality checks

The same checks run on every push and pull request (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, no network
```

Before a release, the store validation can be run locally:

```bash
npx github:GladysAssistant/integration-store .
```

It reports the Docker image as missing until the first release has been built.

## Release

**Actions → Release → Run workflow**, pick `patch`, `minor` or `major`: the workflow bumps
the version everywhere (`package.json` + manifest `version` / `docker_image`), moves the
`[Unreleased]` section of `CHANGELOG.md` under the new version, pushes the `vX.Y.Z` tag,
builds the `linux/amd64` + `linux/arm64` image to `ghcr.io` and publishes the GitHub
Release. The decentralized indexer then picks up the new manifest version — the
repository must be public and carry the `gladys-assistant-integration` GitHub topic, and
the `ghcr.io` package must be public.

## Credits

The Faikout hardware and firmware are the work of Adrian Kennard (RevK) and Andrews &
Arnold Ltd, published under the GPL on
[Codeberg](https://codeberg.org/RevK/ESP32-Faikout). Faikout is their registered
trademark; Daikin is a trademark of Daikin Industries. This project only talks to the
module's local web API, contains none of their code, and is not affiliated with either.

## License

Apache-2.0
