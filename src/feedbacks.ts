import { combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import {
	GAME_PHASE_CHOICES,
	getCasterButtonChoices,
	getOverlayNameChoices,
	getPageChoices,
	MOCK_PHASE_CHOICES,
	POSTGAME_COMPONENT_CHOICES,
} from './choices.js'
import type { MockPhase } from './client/lb-types.js'

// Feedback IDs are permanent public API — frozen at v1.

const COLOR_WHITE = combineRgb(255, 255, 255)
const COLOR_BLACK = combineRgb(0, 0, 0)
const COLOR_GREEN = combineRgb(0, 153, 0)
const COLOR_BLUE = combineRgb(0, 102, 204)
const COLOR_DARK_GREY = combineRgb(51, 51, 51)
const COLOR_AMBER = combineRgb(204, 153, 0)
const COLOR_RED = combineRgb(204, 0, 0)

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		overlayActive: {
			name: 'Overlay Active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [
				{
					id: 'overlayName',
					type: 'dropdown',
					label: 'Overlay',
					choices: getOverlayNameChoices(self.state),
					default: 'Scoreboard',
				},
			],
			callback: (feedback) => {
				return self.state.activeOverlayNames.has(String(feedback.options.overlayName ?? ''))
			},
		},
		casterButtonActive: {
			name: 'Caster Button Active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [
				{
					id: 'buttonId',
					type: 'dropdown',
					label: 'Caster Button',
					choices: getCasterButtonChoices(self.state),
					default: '',
				},
			],
			callback: (feedback) => {
				return self.state.activeOverlaysByButtonId.has(String(feedback.options.buttonId ?? ''))
			},
		},
		casterPageActive: {
			name: 'Caster Page Active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_BLUE,
				color: COLOR_WHITE,
			},
			options: [
				{
					id: 'pageId',
					type: 'dropdown',
					label: 'Page',
					choices: getPageChoices(self.state),
					default: '',
				},
			],
			callback: (feedback) => {
				const pageId = String(feedback.options.pageId ?? '')
				return pageId !== '' && self.state.activePageId === pageId
			},
		},
		gamePhaseIs: {
			name: 'Game Phase Is',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_DARK_GREY,
				color: COLOR_WHITE,
			},
			options: [
				{
					id: 'phase',
					type: 'dropdown',
					label: 'Phase',
					choices: GAME_PHASE_CHOICES,
					default: 'ingame',
				},
			],
			callback: (feedback) => {
				return self.state.phaseLabel === String(feedback.options.phase ?? '')
			},
		},
		mockActive: {
			name: 'Mock Data Active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_AMBER,
				color: COLOR_BLACK,
			},
			options: [
				{
					id: 'phase',
					type: 'dropdown',
					label: 'Phase',
					choices: MOCK_PHASE_CHOICES,
					default: 'ingame',
				},
			],
			callback: (feedback) => {
				return self.state.isMockActive(String(feedback.options.phase ?? 'ingame') as MockPhase)
			},
		},
		postgameComponentActive: {
			name: 'Post-Game Component Active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [
				{
					id: 'componentType',
					type: 'dropdown',
					label: 'Component',
					choices: POSTGAME_COMPONENT_CHOICES,
					default: 'postgame-game',
				},
			],
			callback: (feedback) => {
				const component = self.state.postgameActiveComponent
				return component !== null && component !== '' && component === String(feedback.options.componentType ?? '')
			},
		},
		hotkeysEnabled: {
			name: 'Keyboard Hotkeys Enabled',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [],
			callback: () => {
				return self.state.hotkeysEnabled === true
			},
		},
		tierEntitled: {
			name: 'Tier Entitled',
			type: 'boolean',
			// Style applies when the feedback is TRUE (tier ok). The "upgrade
			// needed" warning preset uses isInverted with a red style instead.
			defaultStyle: {
				bgcolor: COLOR_RED,
				color: COLOR_WHITE,
			},
			options: [],
			callback: () => {
				return !self.state.tierLimited
			},
		},
		cinematicPlaying: {
			name: 'Cinematic Playing',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [],
			callback: () => {
				return self.state.cinematicPlaying
			},
		},
		connected: {
			name: 'Connected to LeagueBroadcast',
			type: 'boolean',
			defaultStyle: {
				bgcolor: COLOR_GREEN,
				color: COLOR_WHITE,
			},
			options: [],
			callback: () => {
				return self.rpcConnected
			},
		},
	})
}
