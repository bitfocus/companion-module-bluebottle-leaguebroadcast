import type { ModuleInstance } from './main.js'

// Variable IDs are permanent public API — frozen at v1.

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions([
		{
			variableId: 'gamePhase',
			name: 'Game phase (outofgame / loading / ingame / paused / mocking / gameover / champselect)',
		},
		{ variableId: 'blueTeamName', name: 'Blue team name' },
		{ variableId: 'redTeamName', name: 'Red team name' },
		{ variableId: 'currentSeries', name: 'Current series (label; empty when none)' },
		{ variableId: 'activePage', name: 'Active caster page name' },
		{ variableId: 'activeOverlayCount', name: 'Number of active overlays' },
		{ variableId: 'postgameComponent', name: 'Active post-game component' },
		{ variableId: 'hotkeysEnabled', name: 'Keyboard hotkeys enabled (on/off)' },
		{ variableId: 'tier', name: 'Tier entitlement (ok/limited)' },
		{ variableId: 'appVersion', name: 'LeagueBroadcast version' },
		{ variableId: 'connectionState', name: 'Connection state' },
	])
}
