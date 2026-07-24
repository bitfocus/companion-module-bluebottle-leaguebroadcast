/**
 * Dropdown choice builders: the static overlay catalog plus dynamic choices
 * (caster buttons, pages, postgame buttons) built from live panel state.
 */

import type { DropdownChoice } from '@companion-module/base'
import type { StylePhase } from './client/lb-types.js'
import type { LeagueBroadcastState } from './state.js'

/**
 * Static overlay catalog. Values are the app's SERIALIZATION property names
 * (IngameStateSerializationData) — the exact names the app reports in the
 * panel state's active overlays and accepts (camelCased) on
 * POST api/ingame/showing, so the same value works for both the overlayActive
 * feedback and the overlaySet action.
 *
 * Two deliberate deltas from CasterActionCatalog's action ids: the catalog
 * action 'GoldGraphV2' drives the wire property 'GoldGraph' (the action kept
 * its V2 suffix, the property did not), and the four 'Latest*' actions
 * (LatestDamageRecap, LatestObjectiveInfo, LatestObjectiveDps,
 * LatestTeamfight) are event-feed pseudo-overlays with no serialization
 * property — the recap overlays they drive appear here as 'DamageRecap' /
 * 'ObjectiveDps' / 'TeamfightTimeline' instead (use the Damage/Objective/
 * Teamfight recap actions to select events).
 */
export const OVERLAY_CATALOG: DropdownChoice[] = [
	{ id: 'Scoreboard', label: 'Scoreboard' },
	{ id: 'ScoreboardBottom', label: 'Scoreboard (Bottom)' },
	{ id: 'Inhibitors', label: 'Inhibitors' },
	{ id: 'BaronPitTimer', label: 'Baron Pit Timer' },
	{ id: 'DragonPitTimer', label: 'Dragon Pit Timer' },
	{ id: 'GoldGraph', label: 'Gold Graph' },
	{ id: 'Runes', label: 'Runes' },
	{ id: 'Patch', label: 'Patch' },
	{ id: 'Tabs', label: 'Tabs' },
	{ id: 'FullGameDamageGraph', label: 'Full Game Damage Graph' },
	{ id: 'TeamfightDamageGraph', label: 'Teamfight Damage Graph' },
	{ id: 'TeamfightNoDamageGraph', label: 'Teamfight (No Damage Graph)' },
	{ id: 'SideInfoExp', label: 'Side Info: Experience' },
	{ id: 'SideInfoGold', label: 'Side Info: Gold' },
	{ id: 'SideInfoDamage', label: 'Side Info: Damage' },
	{ id: 'SideInfoCreepscore', label: 'Side Info: Creep Score' },
	{ id: 'SideInfoRoleQuest', label: 'Side Info: Role Quest' },
	{ id: 'SideInfoTowerPlatings', label: 'Side Info: Tower Platings' },
	{ id: 'SkinDisplay', label: 'Skin Display' },
	{ id: 'TwitchPrediction', label: 'Twitch Prediction' },
	{ id: 'TwitchPoll', label: 'Twitch Poll' },
	{ id: 'TwitchChatVote', label: 'Twitch Chat Vote' },
	{ id: 'DamageSplit', label: 'Damage Split' },
	{ id: 'GoldEfficiency', label: 'Gold Efficiency' },
	{ id: 'ObjectiveDps', label: 'Objective DPS' },
	{ id: 'KillParticipation', label: 'Kill Participation' },
	{ id: 'DamageComposition', label: 'Damage Composition' },
	{ id: 'DamageFlow', label: 'Damage Flow' },
	{ id: 'DamageRecap', label: 'Damage Recap' },
	{ id: 'TeamfightTimeline', label: 'Teamfight Timeline' },
	{ id: 'ChampionDetail', label: 'Champion Detail' },
]

export const POSTGAME_COMPONENT_CHOICES: DropdownChoice[] = [
	{ id: 'postgame-game', label: 'Post-Game: Game' },
	{ id: 'postgame-player', label: 'Post-Game: Player' },
	{ id: 'matchup-full', label: 'Matchup: Full' },
	{ id: 'matchup-current', label: 'Matchup: Current' },
	{ id: 'fearless-bans', label: 'Fearless Bans' },
	{ id: 'postgame-player-stats', label: 'Post-Game: Player Stats' },
]

/** Full GameState enum labels (ids match PHASE_LABELS in state.ts). */
export const GAME_PHASE_CHOICES: DropdownChoice[] = [
	{ id: 'outofgame', label: 'Out of game' },
	{ id: 'loading', label: 'Loading' },
	{ id: 'ingame', label: 'In game' },
	{ id: 'paused', label: 'Paused' },
	{ id: 'mocking', label: 'Mocking' },
	{ id: 'gameover', label: 'Game over' },
	{ id: 'champselect', label: 'Champion select' },
]

export const MOCK_PHASE_CHOICES: DropdownChoice[] = [
	{ id: 'pregame', label: 'Pre-Game (Champion Select)' },
	{ id: 'ingame', label: 'In-Game' },
	{ id: 'postgame', label: 'Post-Game' },
]

export const PLAYER_INDEX_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Blue 1' },
	{ id: 1, label: 'Blue 2' },
	{ id: 2, label: 'Blue 3' },
	{ id: 3, label: 'Blue 4' },
	{ id: 4, label: 'Blue 5' },
	{ id: 5, label: 'Red 1' },
	{ id: 6, label: 'Red 2' },
	{ id: 7, label: 'Red 3' },
	{ id: 8, label: 'Red 4' },
	{ id: 9, label: 'Red 5' },
]

export const TEAM_SIDE_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Blue' },
	{ id: 1, label: 'Red' },
]

/** Winner choices labelled with the current on-screen team names when known. */
export function getGameWinnerChoices(state: LeagueBroadcastState): DropdownChoice[] {
	return [
		{ id: 'blue', label: state.blueTeamName ? `Blue — ${state.blueTeamName}` : 'Blue team' },
		{ id: 'red', label: state.redTeamName ? `Red — ${state.redTeamName}` : 'Red team' },
		{ id: 'clear', label: 'Clear winner' },
	]
}

/** Dropdown of the operator's configured in-game caster buttons. */
export function getCasterButtonChoices(state: LeagueBroadcastState): DropdownChoice[] {
	const pageNames = new Map(state.pages.map((p) => [p.pageId, p.name]))
	const disabledOverlays = new Set(state.disabledOverlays)
	const choices: DropdownChoice[] = state.ingameButtons.map((button) => {
		const name = button.name || button.label || button.overlayName || button.buttonId
		const pageName = pageNames.get(button.pageId)
		// Informational only — the server stays authoritative, so disabled
		// buttons are still selectable (the app rejects the command itself).
		const suffix = button.overlayName && disabledOverlays.has(button.overlayName) ? ' (disabled)' : ''
		return { id: button.buttonId, label: (pageName ? `${name} (${pageName})` : name) + suffix }
	})
	if (choices.length === 0) {
		choices.push({ id: '', label: 'No caster buttons known yet (waiting for LeagueBroadcast)' })
	}
	return choices
}

/** Dropdown of the operator's configured caster pages. */
export function getPageChoices(state: LeagueBroadcastState): DropdownChoice[] {
	const choices: DropdownChoice[] = [...state.pages]
		.sort((a, b) => a.order - b.order)
		.map((page) => ({ id: page.pageId, label: page.name || page.pageId }))
	if (choices.length === 0) {
		choices.push({ id: '', label: 'No pages known yet (waiting for LeagueBroadcast)' })
	}
	return choices
}

/** Dropdown of the configured postgame buttons (numeric ids). */
export function getPostgameButtonChoices(state: LeagueBroadcastState): DropdownChoice[] {
	const choices: DropdownChoice[] = state.postgameButtons.map((button) => ({
		id: button.id,
		label: button.name || button.componentName || String(button.id),
	}))
	if (choices.length === 0) {
		choices.push({ id: -1, label: 'No postgame buttons known yet (waiting for LeagueBroadcast)' })
	}
	return choices
}

/** Dropdown of the series (matches) known to the app; completed series are excluded (the app rejects switching to them). */
export function getSeriesChoices(state: LeagueBroadcastState): DropdownChoice[] {
	const choices: DropdownChoice[] = state.seriesList
		.filter((series) => !series.completed)
		.map((series) => ({ id: series.id, label: series.label }))
	if (choices.length === 0) {
		choices.push({ id: -1, label: 'No series known yet (waiting for LeagueBroadcast)' })
	}
	return choices
}

/** Dropdown of the style sets available for one phase. */
export function getStyleSetChoices(state: LeagueBroadcastState, phase: StylePhase): DropdownChoice[] {
	const choices: DropdownChoice[] = state.styleSets[phase].map((name) => ({ id: name, label: name }))
	if (choices.length === 0) {
		choices.push({ id: '', label: 'No style sets known yet (waiting for LeagueBroadcast)' })
	}
	return choices
}

/** Static overlay catalog plus any dynamically discovered overlay names. */
export function getOverlayNameChoices(state: LeagueBroadcastState): DropdownChoice[] {
	const catalogIds = new Set(OVERLAY_CATALOG.map((c) => c.id))
	const extras: DropdownChoice[] = [...state.knownOverlayNames()]
		.filter((name) => !catalogIds.has(name))
		.sort()
		.map((name) => ({ id: name, label: name }))
	return [...OVERLAY_CATALOG, ...extras]
}
