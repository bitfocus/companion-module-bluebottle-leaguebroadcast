/**
 * Unit tests for the normalized store (src/state.ts): change-set reporting,
 * overlay indexing, choices-hash stability/sensitivity, authenticated status
 * snapshots, and the game-phase label mapping.
 */

import { describe, expect, it } from 'vitest'
import { LeagueBroadcastState, PHASE_LABELS, phaseLabel } from '../state.js'
import type { CompanionSlowStateDto, CompanionStatusDto } from '../client/lb-types.js'
import { makeButton, makeOverlay, makePage, makePanelState, makePostgameButton } from './helpers/fixtures.js'

function status(init: Partial<CompanionStatusDto> = {}): CompanionStatusDto {
	return {
		version: '7.2.7',
		championSelectMock: false,
		ingameMock: false,
		postgameMock: false,
		postgameActiveComponent: '',
		hotkeysEnabled: false,
		...init,
	}
}

function slowState(init: Partial<CompanionSlowStateDto> = {}): CompanionSlowStateDto {
	return {
		series: [],
		currentSeriesId: 0,
		pregameStyleSets: [],
		ingameStyleSets: [],
		postgameStyleSets: [],
		...init,
	}
}

const richPanelState = (): ReturnType<typeof makePanelState> =>
	makePanelState({
		gamePhase: 2,
		blueTeamName: 'Blue',
		redTeamName: 'Red',
		pages: [makePage({ pageId: 'page-1', name: 'Main' }), makePage({ pageId: 'page-2', name: 'Alt', order: 1 })],
		ingameButtons: [makeButton({ buttonId: 'btn-gold', overlayName: 'GoldGraph', pageId: 'page-1' })],
		postgameButtons: [makePostgameButton({ id: 1, componentName: 'scoreboard' })],
		activeOverlays: [makeOverlay({ overlayName: 'GoldGraph', buttonId: 'btn-gold' })],
		disabledOverlays: ['Teamfight'],
		activePageId: 'page-2',
	})

describe('applyPanelState', () => {
	it('reports every changed variable and affected feedback for a first snapshot', () => {
		const state = new LeagueBroadcastState()
		const change = state.applyPanelState(richPanelState())

		expect(change.changedVariables).toEqual({
			gamePhase: 'ingame',
			blueTeamName: 'Blue',
			redTeamName: 'Red',
			activePage: 'Alt',
			activeOverlayCount: 1,
		})
		expect([...change.affectedFeedbacks].sort()).toEqual([
			'casterButtonActive',
			'casterPageActive',
			'gamePhaseIs',
			'overlayActive',
		])
	})

	it('an identical second snapshot changes nothing', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const change = state.applyPanelState(richPanelState())

		expect(change.changedVariables).toEqual({})
		expect(change.affectedFeedbacks).toEqual([])
	})

	it('indexes active overlays into the name Set and the by-buttonId Map', () => {
		const state = new LeagueBroadcastState()
		const overlayA = makeOverlay({ overlayName: 'GoldGraph', buttonId: 'btn-gold' })
		const overlayB = makeOverlay({ overlayName: 'Teamfight', buttonId: 'btn-tf', team: 1 })
		state.applyPanelState(makePanelState({ activeOverlays: [overlayA, overlayB] }))

		expect(state.activeOverlayNames).toEqual(new Set(['GoldGraph', 'Teamfight']))
		expect([...state.activeOverlaysByButtonId.keys()].sort()).toEqual(['btn-gold', 'btn-tf'])
		expect(state.activeOverlaysByButtonId.get('btn-tf')).toEqual(overlayB)
	})

	it('a phase-only change reports only the phase variable and feedback', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const change = state.applyPanelState(makePanelState({ ...richPanelState(), gamePhase: 5 }))

		expect(change.changedVariables).toEqual({ gamePhase: 'gameover' })
		expect(change.affectedFeedbacks).toEqual(['gamePhaseIs'])
	})

	it('filters null entries out of disabledOverlays', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(makePanelState({ disabledOverlays: ['GoldGraph', null, 'Teamfight'] }))
		expect(state.disabledOverlays).toEqual(['GoldGraph', 'Teamfight'])
	})
})

describe('choicesHash', () => {
	it('is stable across separately-built identical states', () => {
		const a = new LeagueBroadcastState()
		const b = new LeagueBroadcastState()
		a.applyPanelState(richPanelState())
		b.applyPanelState(richPanelState())
		expect(a.choicesHash()).toBe(b.choicesHash())
	})

	it('is stable across a re-applied identical snapshot', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const before = state.choicesHash()
		state.applyPanelState(richPanelState())
		expect(state.choicesHash()).toBe(before)
	})

	it('is sensitive to a caster button pageId change', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const before = state.choicesHash()
		const dto = richPanelState()
		dto.ingameButtons = [makeButton({ buttonId: 'btn-gold', overlayName: 'GoldGraph', pageId: 'page-2' })]
		state.applyPanelState(dto)
		expect(state.choicesHash()).not.toBe(before)
	})

	it('is sensitive to a postgame button componentName change', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const before = state.choicesHash()
		const dto = richPanelState()
		dto.postgameButtons = [makePostgameButton({ id: 1, componentName: 'mvp' })]
		state.applyPanelState(dto)
		expect(state.choicesHash()).not.toBe(before)
	})

	it('is sensitive to a disabledOverlays change', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const before = state.choicesHash()
		const dto = richPanelState()
		dto.disabledOverlays = ['Teamfight', 'GoldGraph']
		state.applyPanelState(dto)
		expect(state.choicesHash()).not.toBe(before)
	})

	it('is sensitive to slow-polled series and style-set lists', () => {
		const state = new LeagueBroadcastState()
		const before = state.choicesHash()
		state.applySlowState(
			slowState({
				series: [{ id: 3, label: 'A vs B', completed: false }],
				pregameStyleSets: ['clean'],
			}),
		)
		expect(state.choicesHash()).not.toBe(before)
	})

	it('is sensitive to team-name changes used by the game-winner dropdown', () => {
		const state = new LeagueBroadcastState()
		state.applyPanelState(richPanelState())
		const before = state.choicesHash()
		state.applyPanelState(makePanelState({ ...richPanelState(), blueTeamName: 'New Blue' }))
		expect(state.choicesHash()).not.toBe(before)
	})
})

describe('applyStatus', () => {
	it('applies fresh values and reports variables and feedbacks', () => {
		const state = new LeagueBroadcastState()
		const change = state.applyStatus(
			status({
				version: '7.3.0',
				championSelectMock: true,
				ingameMock: false,
				postgameMock: false,
				postgameActiveComponent: 'scoreboard',
				hotkeysEnabled: true,
			}),
		)

		expect(state.mockPregame).toBe(true)
		expect(state.mockIngame).toBe(false)
		expect(state.mockPostgame).toBe(false)
		expect(change.changedVariables).toEqual({
			postgameComponent: 'scoreboard',
			hotkeysEnabled: 'on',
			appVersion: '7.3.0',
		})
		expect([...change.affectedFeedbacks].sort()).toEqual(['hotkeysEnabled', 'mockActive', 'postgameComponentActive'])
	})

	it('an identical snapshot changes nothing', () => {
		const state = new LeagueBroadcastState()
		const snapshot = status({ championSelectMock: true, postgameActiveComponent: 'scoreboard' })
		state.applyStatus(snapshot)
		const change = state.applyStatus(snapshot)

		expect(change.changedVariables).toEqual({})
		expect(change.affectedFeedbacks).toEqual([])
		expect(state.mockPregame).toBe(true)
	})
})

describe('applySlowState', () => {
	it('applies series list, current series, and style sets', () => {
		const state = new LeagueBroadcastState()
		const change = state.applySlowState(
			slowState({
				series: [
					{ id: 3, label: 'A vs B', completed: false },
					{ id: 4, label: 'C vs D', completed: true },
				],
				currentSeriesId: 3,
				pregameStyleSets: ['clean'],
				ingameStyleSets: ['dark'],
			}),
		)

		expect(change.changedVariables).toEqual({ currentSeries: 'A vs B' })
		expect(change.affectedFeedbacks).toEqual([])
		expect(state.currentSeriesLabel).toBe('A vs B')
		expect(state.styleSets).toEqual({ pregame: ['clean'], ingame: ['dark'], postgame: [] })
	})

	it('zero currentSeriesId means "no series" and clears the label', () => {
		const state = new LeagueBroadcastState()
		state.applySlowState(slowState({ series: [{ id: 3, label: 'A vs B', completed: false }], currentSeriesId: 3 }))
		const change = state.applySlowState(slowState())
		expect(change.changedVariables).toEqual({ currentSeries: '' })
		expect(state.currentSeriesLabel).toBe('')
	})

	it('falls back to the raw id when the list has no entry for the current series', () => {
		const state = new LeagueBroadcastState()
		const change = state.applySlowState(slowState({ currentSeriesId: 99 }))
		expect(change.changedVariables).toEqual({ currentSeries: '99' })
	})

	it('filters null style-set entries from the generated wire arrays', () => {
		const state = new LeagueBroadcastState()
		state.applySlowState(slowState({ pregameStyleSets: ['clean', null], postgameStyleSets: [null, 'gg'] }))
		expect(state.styleSets).toEqual({ pregame: ['clean'], ingame: [], postgame: ['gg'] })
	})
})

describe('phase labels', () => {
	it('maps every known wire value', () => {
		expect(PHASE_LABELS).toHaveLength(7)
		expect(phaseLabel(0)).toBe('outofgame')
		expect(phaseLabel(1)).toBe('loading')
		expect(phaseLabel(2)).toBe('ingame')
		expect(phaseLabel(3)).toBe('paused')
		expect(phaseLabel(4)).toBe('mocking')
		expect(phaseLabel(5)).toBe('gameover')
		expect(phaseLabel(6)).toBe('champselect')
	})

	it('out-of-range values fall back to the raw number as a string', () => {
		expect(phaseLabel(7)).toBe('7')
		expect(phaseLabel(42)).toBe('42')
		expect(phaseLabel(-3)).toBe('-3')
	})

	it('the state getter reports "none" before any panel state arrived', () => {
		const state = new LeagueBroadcastState()
		expect(state.phaseLabel).toBe('none')
		state.applyPanelState(makePanelState({ gamePhase: 6 }))
		expect(state.phaseLabel).toBe('champselect')
	})
})
