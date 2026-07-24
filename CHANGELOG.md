# Changelog

## 0.3.0 — 2026-07-24

- Move every Companion control and state query to a dedicated, authenticated LeagueBroadcast RPC
  contract.
- Vendor only the generated `companion` RPC client used by this module; legacy and unrelated RPC
  namespaces are no longer shipped.
- Add enforced test-coverage thresholds, reaching over 94% statement and 95% line coverage for
  the covered configuration, state, migration, command, and RPC boundary.
- Consolidate continuous integration, add dependency and security-reporting policy files, and
  remove internal design notes from the public repository.
- Document that users should keep LeagueBroadcast and Companion current because the module tracks
  the app's current authenticated RPC API.

## 0.2.4 — 2026-07-23

- Rename the public module id to `bluebottle-leaguebroadcast`, retaining `league-broadcast` as a
  legacy id for pilot configuration migration.
- Use the port advertised by fixed LeagueBroadcast mDNS announcements, including custom app ports.
- Preserve compatibility with older app builds that incorrectly advertised port 80 by falling
  back to the configured port.
- Add current Companion connection-module metadata and correct the MIT license attribution.
- Test the upstream RPC framework fix that authenticates native Bearer clients without requiring
  a synthetic Origin header.

## 0.2.3 — 2026-07-23

- Add blue-team, red-team, and clear game-winner actions and presets.
- Resolve the winning team from the current side order when the action runs.
- Disable the RPC application heartbeat for loopback connections while retaining it for remote
  connections.
- Parse LeagueBroadcast's structured semantic-version response.
- Expand real HTTP and RPC regression coverage.

## 0.2.0 — 2026-07-23

- Add authenticated remote-host support with pairing tokens.
- Add mDNS discovery, full overlay/series/style-set actions, variables, feedbacks, and presets.
- Add mock RPC-server integration tests.

## 0.1.0 — 2026-07-23

- Initial side-load release with RPC caster control, cinematics, REST transition fallbacks,
  variables, feedbacks, presets, and operator help.
