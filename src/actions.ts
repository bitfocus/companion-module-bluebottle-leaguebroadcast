import type { ModuleInstance } from './main.js'
import {
	getCasterButtonChoices,
	getGameWinnerChoices,
	getPageChoices,
	getPostgameButtonChoices,
	getSeriesChoices,
	getStyleSetChoices,
	MOCK_PHASE_CHOICES,
	OVERLAY_CATALOG,
	PLAYER_INDEX_CHOICES,
	POSTGAME_COMPONENT_CHOICES,
	TEAM_SIDE_CHOICES,
} from './choices.js'
import type { GameWinnerSelection, MockPhase, PostgameScope, StylePhase } from './client/lb-types.js'
import type { LeagueBroadcastCommands } from './client/commands.js'
import { isBadRequestError } from './client/rpc.js'

// Action IDs are permanent public API — frozen at v1. Never rename or remove;
// upgrade scripts are the only escape hatch.

/**
 * The RPC client is null while no host is configured (BadConfig) — every
 * callback guards through this helper so a button press logs cleanly
 * instead of throwing a TypeError.
 */
function requireCommands(self: ModuleInstance, actionId: string): LeagueBroadcastCommands | null {
	if (!self.commands) self.log('warn', `${actionId}: not configured — set a LeagueBroadcast host first`)
	return self.commands
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		casterButtonPress: {
			name: 'Caster Button: Press',
			options: [
				{
					id: 'buttonId',
					type: 'dropdown',
					label: 'Caster Button',
					choices: getCasterButtonChoices(self.state),
					default: '',
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
					],
					default: 'toggle',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'casterButtonPress')
				if (!commands) return
				const buttonId = String(event.options.buttonId ?? '')
				if (!buttonId) {
					self.log('warn', 'casterButtonPress: no caster button selected')
					return
				}
				const mode = String(event.options.mode ?? 'toggle')
				let show: boolean
				if (mode === 'show') show = true
				else if (mode === 'hide') show = false
				else show = !self.state.activeOverlaysByButtonId.has(buttonId)
				try {
					const result = await commands.toggleOverlay(buttonId, show)
					self.handleCommandResult('casterButtonPress', result)
				} catch (err) {
					self.handleCommandError('casterButtonPress', err)
				}
			},
		},
		overlaySet: {
			name: 'Overlay: Show/Hide (raw overlay type)',
			options: [
				{
					id: 'overlayKey',
					type: 'dropdown',
					label: 'Overlay',
					tooltip:
						'Targets the overlay type directly — no configured caster button needed. ' +
						'Latest-event recaps are driven by the Damage/Objective/Teamfight recap actions instead.',
					choices: OVERLAY_CATALOG,
					default: 'Scoreboard',
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
					],
					default: 'toggle',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'overlaySet')
				if (!commands) return
				const overlayKey = String(event.options.overlayKey ?? '')
				if (!overlayKey) {
					self.log('warn', 'overlaySet: no overlay selected')
					return
				}
				const mode = String(event.options.mode ?? 'toggle')
				let show: boolean
				if (mode === 'show') show = true
				else if (mode === 'hide') show = false
				// The app reports active overlays under their serialization
				// property names — the same names OVERLAY_CATALOG carries — so
				// the toggle lookup keys directly on activeOverlayNames.
				else show = !self.state.activeOverlayNames.has(overlayKey)
				try {
					await commands.setOverlayShowing(overlayKey, show)
				} catch (err) {
					if (isBadRequestError(err) && /game not running/i.test(err.message)) {
						self.log('warn', `overlaySet: LeagueBroadcast has no running game — ${overlayKey} unchanged`)
						return
					}
					self.handleCommandError('overlaySet', err)
				}
			},
		},
		pageSwitch: {
			name: 'Caster Page: Switch',
			options: [
				{
					id: 'pageId',
					type: 'dropdown',
					label: 'Page',
					choices: getPageChoices(self.state),
					default: '',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'pageSwitch')
				if (!commands) return
				const pageId = String(event.options.pageId ?? '')
				if (!pageId) {
					self.log('warn', 'pageSwitch: no page selected')
					return
				}
				try {
					const result = await commands.pageSwitch(pageId)
					self.handleCommandResult('pageSwitch', result)
				} catch (err) {
					self.handleCommandError('pageSwitch', err)
				}
			},
		},
		deactivateAll: {
			name: 'Deactivate All Overlays',
			options: [],
			callback: async () => {
				const commands = requireCommands(self, 'deactivateAll')
				if (!commands) return
				try {
					const result = await commands.deactivateAll()
					self.handleCommandResult('deactivateAll', result)
				} catch (err) {
					self.handleCommandError('deactivateAll', err)
				}
			},
		},
		damageRecap: {
			name: 'Damage Recap',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'selectLatest', label: 'Select Latest' },
						{ id: 'deselect', label: 'Deselect' },
					],
					default: 'selectLatest',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'damageRecap')
				if (!commands) return
				try {
					const result =
						event.options.mode === 'deselect' ? await commands.damageDeselect() : await commands.damageSelectLatest()
					self.handleCommandResult('damageRecap', result)
				} catch (err) {
					self.handleCommandError('damageRecap', err)
				}
			},
		},
		objectiveRecap: {
			name: 'Objective Recap',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'selectLatest', label: 'Select Latest' },
						{ id: 'deselect', label: 'Deselect' },
					],
					default: 'selectLatest',
				},
				{
					id: 'dps',
					type: 'checkbox',
					label: 'DPS View',
					default: false,
					isVisible: (options) => options.mode === 'selectLatest',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'objectiveRecap')
				if (!commands) return
				try {
					const result =
						event.options.mode === 'deselect'
							? await commands.objectiveDeselect()
							: await commands.objectiveSelectLatest(Boolean(event.options.dps))
					self.handleCommandResult('objectiveRecap', result)
				} catch (err) {
					self.handleCommandError('objectiveRecap', err)
				}
			},
		},
		teamfightTrack: {
			name: 'Teamfight Tracking',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'start', label: 'Start' },
						{ id: 'stop', label: 'Stop' },
					],
					default: 'start',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'teamfightTrack')
				if (!commands) return
				try {
					const result =
						event.options.mode === 'stop' ? await commands.teamfightStop() : await commands.teamfightStart()
					self.handleCommandResult('teamfightTrack', result)
				} catch (err) {
					self.handleCommandError('teamfightTrack', err)
				}
			},
		},
		teamfightOverlay: {
			name: 'Teamfight Overlay',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'selectLatest', label: 'Select Latest' },
						{ id: 'deselect', label: 'Deselect' },
					],
					default: 'selectLatest',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'teamfightOverlay')
				if (!commands) return
				try {
					const result =
						event.options.mode === 'deselect'
							? await commands.teamfightDeselect()
							: await commands.teamfightSelectLatest()
					self.handleCommandResult('teamfightOverlay', result)
				} catch (err) {
					self.handleCommandError('teamfightOverlay', err)
				}
			},
		},
		championDetailPin: {
			name: 'Champion Detail: Pin Player',
			options: [
				{
					id: 'playerIndex',
					type: 'dropdown',
					label: 'Player',
					choices: PLAYER_INDEX_CHOICES,
					default: 0,
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'championDetailPin')
				if (!commands) return
				try {
					const result = await commands.championDetailPin(Number(event.options.playerIndex ?? 0))
					self.handleCommandResult('championDetailPin', result)
				} catch (err) {
					self.handleCommandError('championDetailPin', err)
				}
			},
		},
		postgameShow: {
			name: 'Post-Game: Show Configured Button',
			options: [
				{
					id: 'postgameId',
					type: 'dropdown',
					label: 'Postgame Button',
					choices: getPostgameButtonChoices(self.state),
					default: -1,
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'postgameShow')
				if (!commands) return
				const postgameId = Number(event.options.postgameId ?? -1)
				if (postgameId < 0) {
					self.log('warn', 'postgameShow: no postgame button selected')
					return
				}
				try {
					const result = await commands.postgameShow(postgameId)
					self.handleCommandResult('postgameShow', result)
				} catch (err) {
					self.handleCommandError('postgameShow', err)
				}
			},
		},
		postgameShowComponent: {
			name: 'Post-Game: Show Component',
			options: [
				{
					id: 'componentType',
					type: 'dropdown',
					label: 'Component',
					choices: POSTGAME_COMPONENT_CHOICES,
					default: 'postgame-game',
				},
				{
					id: 'scope',
					type: 'dropdown',
					label: 'Scope',
					choices: [
						{ id: 'current', label: 'Current Game' },
						{ id: 'team', label: 'Team' },
						{ id: 'player', label: 'Player' },
					],
					default: 'current',
				},
				{
					id: 'teamSide',
					type: 'dropdown',
					label: 'Team',
					choices: TEAM_SIDE_CHOICES,
					default: 0,
					isVisible: (options) => options.scope === 'team',
				},
				{
					id: 'playerIndex',
					type: 'dropdown',
					label: 'Player',
					choices: PLAYER_INDEX_CHOICES,
					default: 0,
					isVisible: (options) => options.scope === 'player',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'postgameShowComponent')
				if (!commands) return
				const componentType = String(event.options.componentType ?? '')
				const scope = String(event.options.scope ?? 'current') as PostgameScope
				try {
					await commands.showPostgameComponent(
						componentType,
						scope,
						Number(event.options.teamSide ?? 0),
						Number(event.options.playerIndex ?? 0),
					)
				} catch (err) {
					self.handleCommandError('postgameShowComponent', err)
				}
			},
		},
		postgameClear: {
			name: 'Post-Game: Clear Component',
			options: [],
			callback: async () => {
				const commands = requireCommands(self, 'postgameClear')
				if (!commands) return
				try {
					await commands.clearPostgameComponent()
				} catch (err) {
					self.handleCommandError('postgameClear', err)
				}
			},
		},
		mockSet: {
			name: 'Mock Data: Set',
			options: [
				{
					id: 'phase',
					type: 'dropdown',
					label: 'Phase',
					choices: MOCK_PHASE_CHOICES,
					default: 'ingame',
				},
				{
					id: 'enabled',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
					default: 'on',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'mockSet')
				if (!commands) return
				const phase = String(event.options.phase ?? 'ingame') as MockPhase
				try {
					await commands.setMock(phase, event.options.enabled === 'on')
				} catch (err) {
					self.handleCommandError('mockSet', err)
				}
			},
		},
		seriesSelect: {
			name: 'Series: Select',
			options: [
				{
					id: 'seriesId',
					type: 'dropdown',
					label: 'Series',
					tooltip: 'Series list is fetched from LeagueBroadcast and refreshed every 30 seconds',
					choices: getSeriesChoices(self.state),
					default: -1,
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'seriesSelect')
				if (!commands) return
				const seriesId = Number(event.options.seriesId ?? -1)
				if (!(seriesId >= 0)) {
					self.log('warn', 'seriesSelect: no series selected')
					return
				}
				try {
					await commands.selectSeries(String(seriesId))
					// Pull the polled series state forward so the currentSeries
					// variable updates now instead of on the next 30 s cycle.
					self.requestSlowRefresh()
				} catch (err) {
					self.handleCommandError('seriesSelect', err)
				}
			},
		},
		setBestOf: {
			name: 'Series: Set Best-Of',
			options: [
				{
					id: 'bestOf',
					type: 'dropdown',
					label: 'Best Of',
					choices: [
						{ id: 1, label: 'Best of 1' },
						{ id: 3, label: 'Best of 3' },
						{ id: 5, label: 'Best of 5' },
					],
					default: 3,
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'setBestOf')
				if (!commands) return
				try {
					await commands.setBestOf(Number(event.options.bestOf ?? 3))
				} catch (err) {
					self.handleCommandError('setBestOf', err)
				}
			},
		},
		setGameWinner: {
			name: 'Series: Set Game Winner',
			options: [
				{
					id: 'winner',
					type: 'dropdown',
					label: 'Winner',
					choices: getGameWinnerChoices(self.state),
					default: 'blue',
				},
				{
					id: 'gameId',
					type: 'textinput',
					label: 'Game ID (empty = active/next game in current series)',
					tooltip:
						'Leave empty for the current series side-reference game; enter a game ID to correct a specific game (supports variables)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				const commands = requireCommands(self, 'setGameWinner')
				if (!commands) return
				const winner = String(event.options.winner ?? 'blue') as GameWinnerSelection
				const gameIdText = (await context.parseVariablesInString(String(event.options.gameId ?? ''))).trim()
				const gameId = gameIdText === '' ? undefined : Number(gameIdText)
				if (gameId !== undefined && (!Number.isInteger(gameId) || gameId <= 0)) {
					self.log('warn', `setGameWinner: invalid game ID "${gameIdText}"`)
					return
				}
				try {
					await commands.setGameResult(winner, gameId)
					// A winner can complete a series and change the dropdown/list.
					self.requestSlowRefresh()
				} catch (err) {
					self.handleCommandError('setGameWinner', err)
				}
			},
		},
		swapSides: {
			name: 'Series: Swap Sides',
			options: [
				{
					id: 'seriesId',
					type: 'textinput',
					label: 'Series ID (empty = current series)',
					tooltip:
						'Leave empty to swap sides of the current series; enter a series ID to target another one (supports variables)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				const commands = requireCommands(self, 'swapSides')
				if (!commands) return
				const seriesId = (await context.parseVariablesInString(String(event.options.seriesId ?? ''))).trim()
				try {
					await commands.swapSides(seriesId || undefined)
				} catch (err) {
					self.handleCommandError('swapSides', err)
				}
			},
		},
		cinematicArm: {
			name: 'Cinematic: Arm',
			options: [
				{
					id: 'cinematicId',
					type: 'textinput',
					label: 'Cinematic ID',
					tooltip: 'The cinematic to arm — loaded and paused at its start, ready for Go (supports variables)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				const commands = requireCommands(self, 'cinematicArm')
				if (!commands) return
				const id = (await context.parseVariablesInString(String(event.options.cinematicId ?? ''))).trim()
				if (!id) {
					self.log('warn', 'cinematicArm: no cinematic ID provided')
					return
				}
				try {
					await commands.cinematicArm(id)
				} catch (err) {
					self.handleCommandError('cinematicArm', err)
				}
			},
		},
		cinematicGo: {
			name: 'Cinematic: Go',
			options: [],
			callback: async () => {
				const commands = requireCommands(self, 'cinematicGo')
				if (!commands) return
				try {
					await commands.cinematicGo()
				} catch (err) {
					self.handleCommandError('cinematicGo', err)
				}
			},
		},
		cinematicStop: {
			name: 'Cinematic: Stop',
			options: [],
			callback: async () => {
				const commands = requireCommands(self, 'cinematicStop')
				if (!commands) return
				try {
					await commands.cinematicStop()
				} catch (err) {
					self.handleCommandError('cinematicStop', err)
				}
			},
		},
		cinematicPlay: {
			name: 'Cinematic: Play',
			options: [
				{
					id: 'cinematicId',
					type: 'textinput',
					label: 'Cinematic ID',
					tooltip: 'The cinematic to play immediately (Arm + Go in one step; supports variables)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				const commands = requireCommands(self, 'cinematicPlay')
				if (!commands) return
				const id = (await context.parseVariablesInString(String(event.options.cinematicId ?? ''))).trim()
				if (!id) {
					self.log('warn', 'cinematicPlay: no cinematic ID provided')
					return
				}
				try {
					await commands.cinematicPlay(id)
				} catch (err) {
					self.handleCommandError('cinematicPlay', err)
				}
			},
		},
		hotkeysSet: {
			name: 'Keyboard Hotkeys: Set',
			options: [
				{
					id: 'enabled',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
					default: 'off',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'hotkeysSet')
				if (!commands) return
				try {
					await commands.setHotkeysEnabled(event.options.enabled === 'on')
				} catch (err) {
					self.handleCommandError('hotkeysSet', err)
				}
			},
		},
		styleSetActivate: {
			name: 'Style Set: Activate',
			options: [
				{
					id: 'phase',
					type: 'dropdown',
					label: 'Phase',
					choices: MOCK_PHASE_CHOICES,
					default: 'ingame',
				},
				// One phase-filtered dropdown per phase (isVisible keys on the
				// phase option) instead of a single combined list with
				// phase-prefixed labels — the visible dropdown only ever offers
				// sets that exist for the chosen phase.
				{
					id: 'styleSetPregame',
					type: 'dropdown',
					label: 'Style Set',
					choices: getStyleSetChoices(self.state, 'pregame'),
					default: '',
					isVisible: (options) => options.phase === 'pregame',
				},
				{
					id: 'styleSetIngame',
					type: 'dropdown',
					label: 'Style Set',
					choices: getStyleSetChoices(self.state, 'ingame'),
					default: '',
					isVisible: (options) => options.phase === 'ingame',
				},
				{
					id: 'styleSetPostgame',
					type: 'dropdown',
					label: 'Style Set',
					choices: getStyleSetChoices(self.state, 'postgame'),
					default: '',
					isVisible: (options) => options.phase === 'postgame',
				},
			],
			callback: async (event) => {
				const commands = requireCommands(self, 'styleSetActivate')
				if (!commands) return
				const phase = String(event.options.phase ?? 'ingame') as StylePhase
				const optionId =
					phase === 'pregame' ? 'styleSetPregame' : phase === 'postgame' ? 'styleSetPostgame' : 'styleSetIngame'
				const name = String(event.options[optionId] ?? '')
				if (!name) {
					self.log('warn', 'styleSetActivate: no style set selected')
					return
				}
				try {
					await commands.activateStyleSet(phase, name)
				} catch (err) {
					self.handleCommandError('styleSetActivate', err)
				}
			},
		},
	})
}
