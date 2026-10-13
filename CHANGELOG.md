# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-faikout/commits/main
