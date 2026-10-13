# Security policy

## Supported versions

Only the latest release of the Faikout integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-faikout](https://github.com/prohand/gladys-faikout/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
Faikout firmware (see its
[vulnerability disclosure policy](https://codeberg.org/RevK/ESP32-Faikout/src/branch/main/Manuals/DoC.md))
and the air conditioners themselves.

## Good practices for users

- The Faikout web controls this integration uses have no password: keep the
  modules on a network you trust (a separate IoT VLAN is a good idea), and never
  expose them to the Internet.
- Set a password on the Faikout settings page, so nobody on the network can change
  its Wi-Fi or firmware settings.
- Keep Gladys, the integration and the Faikout firmware up to date.
