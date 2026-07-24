import type { ModuleInstance } from './main.js'
import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import { MOCK_PHASE_CHOICES, POSTGAME_COMPONENT_CHOICES, PLAYER_INDEX_CHOICES } from './choices.js'

const COLOR_WHITE = combineRgb(255, 255, 255)
const COLOR_BLACK = combineRgb(0, 0, 0)
const COLOR_GREEN = combineRgb(0, 153, 0)
const COLOR_AMBER = combineRgb(204, 153, 0)
const COLOR_RED = combineRgb(204, 0, 0)
const COLOR_DARK_RED = combineRgb(153, 0, 0)

// Overlays common enough to ship as ready-made preset tiles. Each targets its
// raw overlay type via overlaySet, so the presets work drag-and-drop with zero
// configuration; overlayName values are the app's serialization property names
// (see OVERLAY_CATALOG in choices.ts) and drive both the action and the
// overlayActive feedback.
const COMMON_OVERLAY_PRESETS: { overlayName: string; label: string }[] = [
	{ overlayName: 'Scoreboard', label: 'Score\nboard' },
	{ overlayName: 'GoldGraph', label: 'Gold\nGraph' },
	{ overlayName: 'Runes', label: 'Runes' },
	{ overlayName: 'BaronPitTimer', label: 'Baron\nTimer' },
	{ overlayName: 'DragonPitTimer', label: 'Dragon\nTimer' },
	{ overlayName: 'Inhibitors', label: 'Inhibs' },
]

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	// --- 1. Setup & Rehearsal ---

	for (const phase of MOCK_PHASE_CHOICES) {
		presets[`mockToggle_${phase.id}`] = {
			type: 'button',
			category: 'Setup & Rehearsal',
			name: `Toggle ${phase.label} mock data`,
			style: {
				text: `Mock\n${String(phase.id)}`,
				size: 'auto',
				color: COLOR_WHITE,
				bgcolor: COLOR_BLACK,
			},
			steps: [
				{
					down: [{ actionId: 'mockSet', options: { phase: phase.id, enabled: 'on' } }],
					up: [],
				},
				{
					down: [{ actionId: 'mockSet', options: { phase: phase.id, enabled: 'off' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mockActive',
					options: { phase: phase.id },
					style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK },
				},
			],
		}
	}

	for (const enabled of ['on', 'off'] as const) {
		presets[`hotkeys_${enabled}`] = {
			type: 'button',
			category: 'Setup & Rehearsal',
			name: `Keyboard hotkeys ${enabled}`,
			style: {
				text: `Hotkeys\n${enabled.toUpperCase()}`,
				size: 'auto',
				color: COLOR_WHITE,
				bgcolor: COLOR_BLACK,
			},
			steps: [
				{
					down: [{ actionId: 'hotkeysSet', options: { enabled } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'hotkeysEnabled',
					options: {},
					isInverted: enabled === 'off',
					style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				},
			],
		}
	}

	// --- 2. Live: Overlays ---

	for (const overlay of COMMON_OVERLAY_PRESETS) {
		presets[`overlay_${overlay.overlayName}`] = {
			type: 'button',
			category: 'Live: Overlays',
			name: `Toggle ${overlay.overlayName}`,
			style: {
				text: overlay.label,
				size: 'auto',
				color: COLOR_WHITE,
				bgcolor: COLOR_BLACK,
			},
			steps: [
				{
					down: [{ actionId: 'overlaySet', options: { overlayKey: overlay.overlayName, mode: 'toggle' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlayActive',
					options: { overlayName: overlay.overlayName },
					style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				},
			],
		}
	}

	// One documented example for the flagship casterButtonPress action: the
	// button layout is the operator's own, so the target button (and the
	// matching feedback) is picked after dragging (see HELP.md).
	presets['casterButtonExample'] = {
		type: 'button',
		category: 'Live: Overlays',
		name: 'Press one of YOUR configured caster buttons (pick it in the action and feedback)',
		style: {
			text: 'MY\nBUTTON',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId: 'casterButtonPress', options: { buttonId: '', mode: 'toggle' } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'casterButtonActive',
				options: { buttonId: '' },
				style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
			},
		],
	}

	presets['deactivateAll'] = {
		type: 'button',
		category: 'Live: Overlays',
		name: 'Deactivate all overlays (panic button)',
		style: {
			text: 'HIDE\nALL',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_RED,
		},
		steps: [
			{
				down: [{ actionId: 'deactivateAll', options: {} }],
				up: [],
			},
		],
		feedbacks: [],
	}

	// --- 3. Live: Recaps ---

	presets['damageRecap_select'] = recapPreset('Damage\nRecap', 'Show latest damage recap', 'damageRecap', {
		mode: 'selectLatest',
	})
	presets['damageRecap_deselect'] = recapPreset('Damage\nRecap\nOFF', 'Hide damage recap', 'damageRecap', {
		mode: 'deselect',
	})
	presets['objectiveRecap_select'] = recapPreset('Obj\nRecap', 'Show latest objective recap', 'objectiveRecap', {
		mode: 'selectLatest',
		dps: false,
	})
	presets['objectiveRecap_selectDps'] = recapPreset(
		'Obj\nRecap\nDPS',
		'Show latest objective recap (DPS view)',
		'objectiveRecap',
		{ mode: 'selectLatest', dps: true },
	)
	presets['objectiveRecap_deselect'] = recapPreset('Obj\nRecap\nOFF', 'Hide objective recap', 'objectiveRecap', {
		mode: 'deselect',
		dps: false,
	})
	presets['teamfightTrack_start'] = recapPreset('TF\nTrack\nSTART', 'Start teamfight tracking', 'teamfightTrack', {
		mode: 'start',
	})
	presets['teamfightTrack_stop'] = recapPreset('TF\nTrack\nSTOP', 'Stop teamfight tracking', 'teamfightTrack', {
		mode: 'stop',
	})
	presets['teamfightOverlay_select'] = recapPreset('TF\nOverlay', 'Show latest teamfight overlay', 'teamfightOverlay', {
		mode: 'selectLatest',
	})
	presets['teamfightOverlay_deselect'] = recapPreset('TF\nOverlay\nOFF', 'Hide teamfight overlay', 'teamfightOverlay', {
		mode: 'deselect',
	})

	for (const player of PLAYER_INDEX_CHOICES) {
		presets[`championDetailPin_${player.id}`] = recapPreset(
			`Pin\n${player.label}`,
			`Pin champion detail: ${player.label}`,
			'championDetailPin',
			{ playerIndex: player.id },
		)
	}

	// --- 4. Post-Game ---

	for (const component of POSTGAME_COMPONENT_CHOICES) {
		presets[`postgameComponent_${component.id}`] = {
			type: 'button',
			category: 'Post-Game',
			name: `Show ${component.label}`,
			style: {
				text: component.label.replace(/: /g, '\n'),
				size: 'auto',
				color: COLOR_WHITE,
				bgcolor: COLOR_BLACK,
			},
			steps: [
				{
					down: [
						{
							actionId: 'postgameShowComponent',
							options: { componentType: component.id, scope: 'current', teamSide: 0, playerIndex: 0 },
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'postgameComponentActive',
					options: { componentType: component.id },
					style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				},
			],
		}
	}

	presets['postgameClear'] = {
		type: 'button',
		category: 'Post-Game',
		name: 'Clear post-game component',
		style: {
			text: 'PG\nCLEAR',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_DARK_RED,
		},
		steps: [
			{
				down: [{ actionId: 'postgameClear', options: {} }],
				up: [],
			},
		],
		feedbacks: [],
	}

	// --- 5. Cinematics ---

	presets['cinematicArm'] = {
		type: 'button',
		category: 'Cinematics',
		name: 'Arm cinematic (fill in the cinematic ID in the action)',
		style: {
			text: 'CIN\nARM',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId: 'cinematicArm', options: { cinematicId: '' } }],
				up: [],
			},
		],
		feedbacks: [],
	}

	presets['cinematicGo'] = {
		type: 'button',
		category: 'Cinematics',
		name: 'Go (start the armed cinematic)',
		style: {
			text: 'CIN\nGO',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId: 'cinematicGo', options: {} }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'cinematicPlaying',
				options: {},
				style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
			},
		],
	}

	presets['cinematicStop'] = {
		type: 'button',
		category: 'Cinematics',
		name: 'Stop cinematic playback',
		style: {
			text: 'CIN\nSTOP',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_DARK_RED,
		},
		steps: [
			{
				down: [{ actionId: 'cinematicStop', options: {} }],
				up: [],
			},
		],
		feedbacks: [],
	}

	presets['cinematicPlaying'] = {
		type: 'button',
		category: 'Cinematics',
		name: 'Cinematic playing status',
		style: {
			text: 'CIN\nIDLE',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'cinematicPlaying',
				options: {},
				style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE, text: 'CIN\nLIVE' },
			},
		],
	}

	// --- 6. Series Control ---

	for (const side of ['blue', 'red'] as const) {
		const variableId = side === 'blue' ? 'blueTeamName' : 'redTeamName'
		presets[`setGameWinner_${side}`] = {
			type: 'button',
			category: 'Series Control',
			name: `Set the ${side} team as game winner`,
			style: {
				text: `WIN\n$(${self.label}:${variableId})`,
				size: 'auto',
				color: COLOR_WHITE,
				bgcolor: COLOR_BLACK,
			},
			steps: [
				{
					down: [{ actionId: 'setGameWinner', options: { winner: side, gameId: '' } }],
					up: [],
				},
			],
			feedbacks: [],
		}
	}

	presets['clearGameWinner'] = {
		type: 'button',
		category: 'Series Control',
		name: 'Clear the game winner',
		style: {
			text: 'CLEAR\nWINNER',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_DARK_RED,
		},
		steps: [
			{
				down: [{ actionId: 'setGameWinner', options: { winner: 'clear', gameId: '' } }],
				up: [],
			},
		],
		feedbacks: [],
	}

	presets['swapSides'] = {
		type: 'button',
		category: 'Series Control',
		name: 'Swap sides of the current series',
		style: {
			text: 'SWAP\nSIDES',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId: 'swapSides', options: { seriesId: '' } }],
				up: [],
			},
		],
		feedbacks: [],
	}

	presets['status_currentSeries'] = {
		type: 'button',
		category: 'Series Control',
		name: 'Current series',
		style: {
			// self.label, not a hard-coded connection name: the user may have
			// renamed the connection, and variable refs resolve against the label.
			text: `Series\n$(${self.label}:currentSeries)`,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [],
		feedbacks: [],
	}

	// --- 7. Status ---

	presets['status_gamePhase'] = {
		type: 'button',
		category: 'Status',
		name: 'Game phase',
		style: {
			text: `Phase\n$(${self.label}:gamePhase)`,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [],
		feedbacks: [],
	}

	presets['status_teams'] = {
		type: 'button',
		category: 'Status',
		name: 'Team names',
		style: {
			text: `$(${self.label}:blueTeamName) vs $(${self.label}:redTeamName)`,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [],
		feedbacks: [],
	}

	presets['status_connection'] = {
		type: 'button',
		category: 'Status',
		name: 'Connection state',
		style: {
			text: `LB\n$(${self.label}:connectionState)`,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_DARK_RED,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'connected',
				options: {},
				style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
			},
		],
	}

	presets['status_tierWarning'] = {
		type: 'button',
		category: 'Status',
		name: 'Tier warning (red when Basic tier is missing)',
		style: {
			text: `Tier\n$(${self.label}:tier)`,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'tierEntitled',
				options: {},
				isInverted: true,
				style: { bgcolor: COLOR_RED, color: COLOR_WHITE },
			},
		],
	}

	self.setPresetDefinitions(presets)
}

function recapPreset(
	text: string,
	name: string,
	actionId: string,
	options: Record<string, string | number | boolean>,
): CompanionPresetDefinitions[string] {
	return {
		type: 'button',
		category: 'Live: Recaps',
		name,
		style: {
			text,
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId, options }],
				up: [],
			},
		],
		feedbacks: [],
	}
}
