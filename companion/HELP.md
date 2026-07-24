# LeagueBroadcast

Control [LeagueBroadcast](https://bluebottle.gg) League of Legends broadcast overlays from a
Companion surface: toggle in-game overlays, switch caster pages, drive damage/objective/teamfight
recaps, pin champion details, push post-game stat screens, control rehearsal (mock) data, and keep
a panic "hide everything" button under your finger. Between games it can also confirm or correct
the game winner and swap blue/red sides without leaving the broadcast surface.

## Requirements

- **LeagueBroadcast running and reachable.** On the same machine it works with zero extra
  configuration. Companion on a different machine (e.g. a Companion Pi) needs a pairing token —
  see [Remote control from another machine](#remote-control-from-another-machine).
- **Current software versions.** Keep LeagueBroadcast and Companion up to date. This module uses
  LeagueBroadcast's current authenticated RPC API and may not work with older app builds.
- **Logged in to LeagueBroadcast.** The module rides on the entitlements of the logged-in app user.
- **Basic tier for most overlays.** The free tier can control Scoreboard, Inhibitors, the Baron and
  Dragon pit timers, and the Twitch overlays. Everything else — including the post-game stat
  screens — requires the LeagueBroadcast **Basic** tier. Gating is enforced by the app itself, and
  the free tier stays fully usable: the connection status remains OK. When a gated button is
  pressed without the tier, the button does nothing, the module logs an error explaining why
  ("Companion control requires the LeagueBroadcast Basic tier"), the `tier` variable switches to
  `limited`, and the **Tier Entitled** feedback turns false — invert it for a red warning tile
  (the **Status** preset category ships one ready-made).

## Configuration

| Setting                      | Default     | Notes                                                                                                                                                                                                                                                 |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LeagueBroadcast (discovered) | Manual      | Instances found on the network via auto-discovery. Fixed app builds supply both host and port. Older builds advertised port 80 incorrectly; the module detects that legacy value and uses the Port field below. "Manual" uses Host and Port directly. |
| Host                         | `127.0.0.1` | Hostname or IP of the machine running LeagueBroadcast. Keep the default when Companion runs on the same machine.                                                                                                                                      |
| Port                         | `58869`     | LeagueBroadcast API port for manual connections and as the fallback for legacy/invalid discovery announcements.                                                                                                                                       |
| Pairing token (remote only)  | empty       | Only needed when Companion runs on a different machine. Leave empty on the same machine.                                                                                                                                                              |

## Remote control from another machine

Running Companion on the same machine as LeagueBroadcast needs nothing — local connections are
trusted automatically, leave the pairing token empty. To control LeagueBroadcast from a different
machine (a Companion Pi, a second PC):

1. **Generate a pairing token** on the broadcast PC: LeagueBroadcast → **Settings** → **Remote
   Control** → generate. The token is shown once — copy it right away.
2. **Paste the token** into the module's **Pairing token** config field and set **Host** to the
   broadcast PC's hostname or IP (or pick it from the discovered list).
3. **Make port `58869` reachable** from the Companion machine. On Windows, allow LeagueBroadcast
   (or TCP port 58869) through Windows Defender Firewall on the broadcast PC — the first-run
   firewall prompt only covers some network profiles, so check both Private and Public if the
   machines sit on an unusual network.

Revoking the token in the app (or generating a new one) invalidates the old one immediately; the
module then shows an Authentication Failure until the new token is entered.

## Actions

| Action                            | What it does                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Caster Button: Press              | Toggle/show/hide one of **your** configured caster panel buttons (dropdown mirrors the in-app panel).                                                                                                                                                                                |
| Overlay: Show/Hide                | Toggle/show/hide a raw overlay type directly — no configured caster button needed. The latest-event recap buttons (latest damage/objective/teamfight) are event-driven and not listed here; use the recap actions below instead. Only works while a game is running or mocked.       |
| Caster Page: Switch               | Switch the active caster page.                                                                                                                                                                                                                                                       |
| Deactivate All Overlays           | Panic button — hides every active overlay.                                                                                                                                                                                                                                           |
| Damage Recap                      | Select the latest damage recap, or deselect it.                                                                                                                                                                                                                                      |
| Objective Recap                   | Select the latest objective recap (optionally the DPS view), or deselect it.                                                                                                                                                                                                         |
| Teamfight Tracking                | Start/stop teamfight tracking.                                                                                                                                                                                                                                                       |
| Teamfight Overlay                 | Select the latest teamfight overlay, or deselect it.                                                                                                                                                                                                                                 |
| Champion Detail: Pin Player       | Pin the champion detail view to a player (Blue 1–5, Red 1–5).                                                                                                                                                                                                                        |
| Post-Game: Show Configured Button | Trigger one of the postgame buttons configured in the app.                                                                                                                                                                                                                           |
| Post-Game: Show Component         | Push a post-game component directly (game/player/matchup/fearless-bans/player-stats) with current/team/player scope.                                                                                                                                                                 |
| Post-Game: Clear Component        | Clear the active post-game component.                                                                                                                                                                                                                                                |
| Cinematic: Arm                    | Arm a cinematic by ID — loaded and paused at its start, ready for an instant Go.                                                                                                                                                                                                     |
| Cinematic: Go                     | Start the armed cinematic.                                                                                                                                                                                                                                                           |
| Cinematic: Stop                   | Stop cinematic playback and tear it down.                                                                                                                                                                                                                                            |
| Cinematic: Play                   | Play a cinematic by ID immediately (Arm + Go in one step).                                                                                                                                                                                                                           |
| Mock Data: Set                    | Turn rehearsal (mock) data on/off per phase (pre-game/in-game/post-game).                                                                                                                                                                                                            |
| Series: Select                    | Make a series the current one (dropdown of the app's non-completed series, refreshed every 30 s). Requires the Basic tier.                                                                                                                                                           |
| Series: Set Best-Of               | Set the current series to Bo1/Bo3/Bo5.                                                                                                                                                                                                                                               |
| Series: Set Game Winner           | Set the blue/red team as winner of the active/next game in the current series, or clear the winner. Team IDs are resolved from the current side order when pressed, so the action remains correct after a side swap. An optional game ID can target a specific game for corrections. |
| Series: Swap Sides                | Swap blue/red sides — the same operation as the app's Swap Sides button. Leave the series ID empty for the current series, or enter one to target another (supports variables).                                                                                                      |
| Keyboard Hotkeys: Set             | Enable/disable the app's keyboard hotkeys (turn them off when the deck replaces them).                                                                                                                                                                                               |
| Style Set: Activate               | Activate a style set for a phase (pre-game/in-game/post-game). The set dropdown is filtered by the chosen phase and refreshed every 30 s.                                                                                                                                            |

## Feedbacks

All feedbacks are boolean and can restyle the button when true.

| Feedback                     | True when                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Overlay Active               | The selected overlay type is currently visible.                                                            |
| Caster Button Active         | The selected configured caster button's overlay is live.                                                   |
| Caster Page Active           | The selected caster page is active.                                                                        |
| Game Phase Is                | The game phase matches (out of game / loading / in game / paused / mocking / game over / champion select). |
| Mock Data Active             | Mock data for the selected phase is on.                                                                    |
| Post-Game Component Active   | The selected post-game component is showing.                                                               |
| Keyboard Hotkeys Enabled     | The app's keyboard hotkeys are enabled.                                                                    |
| Tier Entitled                | The required tier is present (invert it for a warning tile).                                               |
| Cinematic Playing            | A cinematic is currently playing.                                                                          |
| Connected to LeagueBroadcast | The module's live connection to the app is up.                                                             |

## Variables

The examples below use the default connection label `bluebottle-leaguebroadcast`. If you rename
the connection in Companion, use that label as the variable prefix instead. Connections migrated
from the legacy `league-broadcast` module id keep working through the manifest's `legacyIds`
mapping and may retain their existing connection label.

| Variable                                           | Contents                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `$(bluebottle-leaguebroadcast:gamePhase)`          | `outofgame` / `loading` / `ingame` / `paused` / `mocking` / `gameover` / `champselect` (`none` until the first update) |
| `$(bluebottle-leaguebroadcast:blueTeamName)`       | Blue team name                                                                                                         |
| `$(bluebottle-leaguebroadcast:redTeamName)`        | Red team name                                                                                                          |
| `$(bluebottle-leaguebroadcast:currentSeries)`      | Label of the current series (match name or "Team A vs Team B"; empty when none)                                        |
| `$(bluebottle-leaguebroadcast:activePage)`         | Active caster page name                                                                                                |
| `$(bluebottle-leaguebroadcast:activeOverlayCount)` | Number of active overlays                                                                                              |
| `$(bluebottle-leaguebroadcast:postgameComponent)`  | Active post-game component (empty when none)                                                                           |
| `$(bluebottle-leaguebroadcast:hotkeysEnabled)`     | `on` / `off`                                                                                                           |
| `$(bluebottle-leaguebroadcast:tier)`               | `ok` / `limited` (`limited` after the app rejected a gated command for tier reasons)                                   |
| `$(bluebottle-leaguebroadcast:appVersion)`         | LeagueBroadcast version                                                                                                |
| `$(bluebottle-leaguebroadcast:connectionState)`    | Connection state                                                                                                       |

## Presets

Presets are organized by broadcast phase so you can drag a whole page at a time:

1. **Setup & Rehearsal** — mock-data toggles per phase (amber when active) and a keyboard-hotkeys
   on/off pair.
2. **Live: Overlays** — ready-made tiles for the six most common overlays (Scoreboard, Gold Graph,
   Runes, Baron Timer, Dragon Timer, Inhibitors) plus a red **HIDE ALL** panic button. These target
   the raw overlay types directly, so they work drag-and-drop with zero configuration — action and
   active-state feedback are both pre-wired. The **MY BUTTON** tile is the example for driving one
   of **your** configured caster panel buttons instead (honoring its custom settings): after
   dragging it, pick your button in both the action and the feedback.
3. **Live: Recaps** — damage/objective/teamfight recap select+deselect pairs, teamfight tracking
   start/stop, and champion-detail pins for all ten players.
4. **Post-Game** — one tile per post-game component plus a clear button.
5. **Cinematics** — Arm / Go / Stop tiles (fill in your cinematic ID in the Arm action) and a
   playing-status tile (green while a cinematic is live).
6. **Series Control** — zero-config blue-win, red-win, clear-winner, and **SWAP SIDES** tiles for
   the current series, plus a current-series text tile.
7. **Status** — game-phase and team-name text tiles, a connection tile (green when connected), and
   a tier warning tile (red when the Basic tier is missing).

## Troubleshooting

An **Authentication Failure** status is always a pairing/authentication problem (remote setups) —
tier limitations never change the instance status (see the first bullet after the table).

| Instance status                                                                                                       | Meaning                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OK                                                                                                                    | Connected. Tier limitations do not change the status — check the `tier` variable or the **Tier Entitled** feedback.                                                                                                                                                                    |
| Connecting                                                                                                            | Waiting for LeagueBroadcast (initial connect or reconnect in progress).                                                                                                                                                                                                                |
| Connection Failure                                                                                                    | LeagueBroadcast has not been reachable at the configured host:port for several reconnect attempts — is the app running? The module keeps retrying and recovers automatically once the app is back.                                                                                     |
| Connection Failure with "Invalid host or port"                                                                        | The configured host/port cannot form a valid address (e.g. a mistyped IPv6 literal). Fix the Host/Port fields — the module does not retry until the configuration changes.                                                                                                             |
| Disconnected                                                                                                          | The connection dropped; the module reconnects automatically.                                                                                                                                                                                                                           |
| Authentication Failure with "Invalid pairing token — generate a new one in LeagueBroadcast Settings → Remote Control" | The configured pairing token was rejected (revoked, regenerated, or mistyped). Generate a fresh token in the app and paste it into the module config; the module keeps retrying and recovers as soon as the token matches.                                                             |
| Authentication Failure with "This connection needs a pairing token (LeagueBroadcast Settings → Remote Control)"       | Companion reached LeagueBroadcast from another machine without a pairing token, so all control commands are refused. Generate a token in the app and enter it in the module config. On the same machine this should never appear — check that Host really points at the local machine. |
| Bad Configuration                                                                                                     | No host configured.                                                                                                                                                                                                                                                                    |

- **A gated button does nothing while status is OK:** the app rejected the command for tier
  reasons. The module logs an error with the app's message ("Companion control requires the
  LeagueBroadcast Basic tier"), sets `$(bluebottle-leaguebroadcast:tier)` to `limited`, and turns the
  **Tier Entitled** feedback false — put an inverted Tier Entitled feedback on a tile for an
  always-visible warning (the **Status** preset category ships one ready-made). After upgrading
  the tier in the app, the `limited` flag clears on the next (re)connect — disable/enable the
  connection (or restart the app) to pick the upgrade up immediately.
- Overlay/recap buttons doing nothing while status is OK and the tier is fine: check the app is in
  the right phase (e.g. post-game screens need a finished or mocked game).
- Both a keyboard hotkey and a Stream Deck button firing: disable the app's keyboard hotkeys with
  the **Keyboard Hotkeys: Set** action.
