# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.2.0] - 2026-10-25

### Added

- Store search keywords (Faikin, RevK, ESP32, the S21 / X50A Daikin protocols, "heat pump"…), so
  the integration is found by what users type.

### Changed

- Gladys 5.3.0 or later is now required (the store search keywords need it).
- `@gladysassistant/integration-sdk` updated to 0.16.0.

## [1.1.1] - 2026-10-23

- Maintenance release, no functional change.

## [1.1.0] - 2026-10-13

### Added

- German and Spanish translations (configuration screen, messages, widgets, documentation).

### Fixed

- The English documentation names the Gladys screens as the Gladys interface does.

## [1.0.2] - 2026-10-13

### Fixed

- Fan speed no longer offers Turbo in Gladys: Faikout fans have only auto, five speeds and quiet.

## [1.0.1] - 2026-10-13

### Added

- Faikout integration for Gladys 5.1+, local only: one device per Daikin air conditioner fitted with a Faikout module, keyed by its MAC address.
- Power, mode, set point, fan speed, horizontal and vertical swing, Econo, Powerful, Comfort, Streamer and quiet outdoor unit, with the room, outside, inlet and refrigerant temperatures, humidity and power consumption — only the ones the unit reports.
- Transport badge per device: local, degraded when the air conditioner does not answer its Faikout, unreachable when the Faikout does not answer.
- Scene triggers: an air conditioner goes offline or comes back, is changed outside Gladys (remote, Faikout page, timer), starts or ends defrosting.
- Scene actions: set an air conditioner (power, mode, set point, fan in one go), set Faikout auto, read an air conditioner.
- Dashboard widgets: one air conditioner (room, set point, outside and power tiles, 24 h temperature chart, state, mode, fan, flaps and comfort modes), and an overview of all of them.
- "Test the connection" button in the Configuration screen.
- "Web password" field, for units protected by a Faikout web password; the connection test says when it is missing or wrong.
- Horizontal and vertical swing offer only Off and Swing in Gladys: Faikout flaps have no fixed positions.
- Energy meter (kWh index) of the units that report it, for Gladys energy monitoring: 30-minute consumption and cost.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-faikout/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/prohand/gladys-faikout/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/prohand/gladys-faikout/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/prohand/gladys-faikout/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/prohand/gladys-faikout/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-faikout/releases/tag/v1.0.1
