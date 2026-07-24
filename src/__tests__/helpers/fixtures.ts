/**
 * Plain-object DTO factories for tests. Every factory fills the full DTO with
 * neutral defaults and spreads the caller's overrides on top, so specs only
 * spell out the fields they assert on.
 */

import type {
	CasterActiveOverlayDto,
	CasterButtonDto,
	CasterPageStateDto,
	CasterPanelStateDto,
	CasterPostgameButtonDto,
	CasterRosterEntryDto,
} from '../../client/lb-types.js'

export function makeButton(init: Partial<CasterButtonDto> = {}): CasterButtonDto {
	return {
		buttonId: 'btn-1',
		name: 'Gold graph',
		overlayName: 'GoldGraph',
		backgroundColor: '#123456',
		hasSettings: false,
		allowSinglePlayers: false,
		allowTimePeriod: false,
		available: true,
		pageId: 'page-1',
		position: 0,
		label: 'Gold',
		actionType: 'toggle-overlay',
		targetPageId: '',
		allowTeams: false,
		...init,
	}
}

export function makePostgameButton(init: Partial<CasterPostgameButtonDto> = {}): CasterPostgameButtonDto {
	return {
		id: 1,
		name: 'Scoreboard',
		componentName: 'scoreboard',
		backgroundColor: '#654321',
		allowPlayers: false,
		allowTeams: false,
		requiresCompletedGame: false,
		available: true,
		...init,
	}
}

export function makeOverlay(init: Partial<CasterActiveOverlayDto> = {}): CasterActiveOverlayDto {
	return {
		overlayName: 'GoldGraph',
		buttonId: 'btn-1',
		timePeriod: -1,
		team: -1,
		players: [],
		...init,
	}
}

export function makeRosterEntry(init: Partial<CasterRosterEntryDto> = {}): CasterRosterEntryDto {
	return {
		playerIndex: 0,
		summonerName: 'Player One',
		championName: 'Ahri',
		team: 0,
		...init,
	}
}

export function makePage(init: Partial<CasterPageStateDto> = {}): CasterPageStateDto {
	return {
		pageId: 'page-1',
		name: 'Main',
		order: 0,
		...init,
	}
}

export function makePanelState(init: Partial<CasterPanelStateDto> = {}): CasterPanelStateDto {
	return {
		roomName: '',
		revision: 0n,
		sessionActive: false,
		gamePhase: 0,
		gameName: '',
		blueTeamName: '',
		redTeamName: '',
		ingameButtons: [],
		postgameButtons: [],
		activeOverlays: [],
		disabledOverlays: [],
		roster: [],
		pages: [],
		activePageId: '',
		rosterHidden: false,
		eventFeedHidden: false,
		teamfightHidden: false,
		postgameHidden: false,
		...init,
	}
}
