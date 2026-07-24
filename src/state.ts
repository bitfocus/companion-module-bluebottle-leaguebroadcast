/**
 * Normalized store for everything the module knows about LeagueBroadcast.
 *
 * Mutators return the exact set of changed variables and affected feedback IDs
 * so main.ts can batch one setVariableValues() call and run targeted
 * checkFeedbacks() per event instead of blanket refreshes.
 */

import type {
	CasterActiveOverlayDto,
	CasterButtonDto,
	CasterPageStateDto,
	CasterPanelStateDto,
	CasterPostgameButtonDto,
	CasterRosterEntryDto,
	CompanionSeriesSummaryDto,
	CompanionSlowStateDto,
	CompanionStatusDto,
	MockPhase,
	StylePhase,
} from './client/lb-types.js'

/**
 * GamePhase wire int → label mapping. The wire value is the app's full
 * GameState enum (IngameController.cs): 0=OutOfGame, 1=Loading, 2=Running,
 * 3=Paused, 4=Mocking, 5=GameOver, 6=ChampionSelect. Ints outside range fall
 * back to String(value).
 */
export const PHASE_LABELS = ['outofgame', 'loading', 'ingame', 'paused', 'mocking', 'gameover', 'champselect']

export function phaseLabel(value: number): string {
	const label = PHASE_LABELS[value]
	return label !== undefined ? label : String(value)
}

export interface StateChange {
	changedVariables: Record<string, string | number | undefined>
	affectedFeedbacks: string[]
}

export class LeagueBroadcastState {
	// --- panel state (RPC subscription) ---
	gamePhase = -1
	gameName = ''
	blueTeamName = ''
	redTeamName = ''
	pages: CasterPageStateDto[] = []
	ingameButtons: CasterButtonDto[] = []
	postgameButtons: CasterPostgameButtonDto[] = []
	/** Overlay names currently active. */
	activeOverlayNames = new Set<string>()
	/** Active overlays keyed by the caster button that activated them. */
	activeOverlaysByButtonId = new Map<string, CasterActiveOverlayDto>()
	disabledOverlays: string[] = []
	activePageId = ''
	roster: CasterRosterEntryDto[] = []

	// --- slow authenticated RPC state (30 s cadence) ---
	seriesList: CompanionSeriesSummaryDto[] = []
	/** `null` = the app reports no current series. */
	currentSeriesId: number | null = null
	styleSets: Record<StylePhase, string[]> = { pregame: [], ingame: [], postgame: [] }

	// --- authenticated RPC status (5 s cadence) ---
	mockPregame: boolean | null = null
	mockIngame: boolean | null = null
	mockPostgame: boolean | null = null
	postgameActiveComponent: string | null = null
	hotkeysEnabled: boolean | null = null
	appVersion: string | null = null

	// --- cinematics (RPC playback subscription) ---
	cinematicPlaying = false

	// --- connection state ---
	/**
	 * Sticky per-connection-cycle flag: the app rejected a gated call for
	 * tier/entitlement reasons. Surfaces ONLY through the `tier` variable and
	 * the `tierEntitled` feedback — never through the instance status (free
	 * tier stays fully usable). Cleared exclusively by handleConnected.
	 */
	tierLimited = false
	connectionState = 'disconnected'

	get phaseLabel(): string {
		return this.gamePhase < 0 ? 'none' : phaseLabel(this.gamePhase)
	}

	get activePageName(): string {
		const page = this.pages.find((p) => p.pageId === this.activePageId)
		return page ? page.name : ''
	}

	/** Label of the current series ('' when none; the raw id when the list has no entry for it). */
	get currentSeriesLabel(): string {
		if (this.currentSeriesId === null) return ''
		const series = this.seriesList.find((s) => s.id === this.currentSeriesId)
		return series ? series.label : String(this.currentSeriesId)
	}

	isMockActive(phase: MockPhase): boolean {
		switch (phase) {
			case 'pregame':
				return this.mockPregame === true
			case 'ingame':
				return this.mockIngame === true
			case 'postgame':
				return this.mockPostgame === true
		}
	}

	/** Static-catalog-independent overlay names known from the live config. */
	knownOverlayNames(): Set<string> {
		const names = new Set<string>()
		for (const button of this.ingameButtons) {
			if (button.overlayName) names.add(button.overlayName)
		}
		for (const name of this.activeOverlayNames) names.add(name)
		return names
	}

	/**
	 * Cheap hash over everything that feeds dynamic dropdown choices.
	 * main.ts compares it across panel-state pushes to decide whether action &
	 * feedback definitions must be rebuilt (avoids rebuild churn per state tick).
	 */
	choicesHash(): string {
		return JSON.stringify([
			this.pages.map((p) => [p.pageId, p.name, p.order]),
			// pageId feeds the "(page name)" suffix in caster button labels.
			this.ingameButtons.map((b) => [b.buttonId, b.name, b.label, b.overlayName, b.pageId]),
			// componentName is the label fallback for unnamed postgame buttons.
			this.postgameButtons.map((b) => [b.id, b.name, b.componentName]),
			[...this.knownOverlayNames()].sort(),
			// disabledOverlays feeds the "(disabled)" suffix in caster button labels.
			[...this.disabledOverlays].sort(),
			// Series and style-set lists feed the seriesSelect / styleSetActivate dropdowns.
			this.seriesList.map((s) => [s.id, s.label, s.completed]),
			this.styleSets.pregame,
			this.styleSets.ingame,
			this.styleSets.postgame,
			// Team names feed the setGameWinner dropdown labels.
			this.blueTeamName,
			this.redTeamName,
		])
	}

	applyPanelState(dto: CasterPanelStateDto): StateChange {
		const changedVariables: Record<string, string | number | undefined> = {}
		const affectedFeedbacks = new Set<string>()

		if (dto.gamePhase !== this.gamePhase) {
			this.gamePhase = dto.gamePhase
			changedVariables['gamePhase'] = this.phaseLabel
			affectedFeedbacks.add('gamePhaseIs')
		}
		if (dto.blueTeamName !== this.blueTeamName) {
			this.blueTeamName = dto.blueTeamName
			changedVariables['blueTeamName'] = dto.blueTeamName
		}
		if (dto.redTeamName !== this.redTeamName) {
			this.redTeamName = dto.redTeamName
			changedVariables['redTeamName'] = dto.redTeamName
		}
		const previousPageName = this.activePageName

		this.gameName = dto.gameName
		this.pages = dto.pages
		this.ingameButtons = dto.ingameButtons
		this.postgameButtons = dto.postgameButtons
		this.disabledOverlays = dto.disabledOverlays.filter((name): name is string => name !== null)
		this.roster = dto.roster

		if (dto.activePageId !== this.activePageId) {
			this.activePageId = dto.activePageId
			affectedFeedbacks.add('casterPageActive')
		}
		const newPageName = this.activePageName
		if (newPageName !== previousPageName) {
			changedVariables['activePage'] = newPageName
		}

		const newNames = new Set<string>()
		const newByButtonId = new Map<string, CasterActiveOverlayDto>()
		for (const overlay of dto.activeOverlays) {
			if (overlay.overlayName) newNames.add(overlay.overlayName)
			if (overlay.buttonId) newByButtonId.set(overlay.buttonId, overlay)
		}
		const namesChanged =
			newNames.size !== this.activeOverlayNames.size || [...newNames].some((n) => !this.activeOverlayNames.has(n))
		const buttonsChanged =
			newByButtonId.size !== this.activeOverlaysByButtonId.size ||
			[...newByButtonId.keys()].some((id) => !this.activeOverlaysByButtonId.has(id))
		this.activeOverlayNames = newNames
		this.activeOverlaysByButtonId = newByButtonId
		if (namesChanged) {
			changedVariables['activeOverlayCount'] = newNames.size
			affectedFeedbacks.add('overlayActive')
		}
		if (buttonsChanged) {
			affectedFeedbacks.add('casterButtonActive')
		}

		return { changedVariables, affectedFeedbacks: [...affectedFeedbacks] }
	}

	/**
	 * Single source for the `connectionState` variable: main.ts routes every
	 * connection event through here and only publishes the variable (and
	 * re-checks the 'connected' feedback) when the value actually changed.
	 */
	applyConnectionState(next: string): StateChange {
		const changedVariables: Record<string, string | number | undefined> = {}
		const affectedFeedbacks: string[] = []
		if (next !== this.connectionState) {
			this.connectionState = next
			changedVariables['connectionState'] = next
			affectedFeedbacks.push('connected')
		}
		return { changedVariables, affectedFeedbacks }
	}

	applyStatus(status: CompanionStatusDto): StateChange {
		const changedVariables: Record<string, string | number | undefined> = {}
		const affectedFeedbacks = new Set<string>()

		if (status.championSelectMock !== this.mockPregame) {
			this.mockPregame = status.championSelectMock
			affectedFeedbacks.add('mockActive')
		}
		if (status.ingameMock !== this.mockIngame) {
			this.mockIngame = status.ingameMock
			affectedFeedbacks.add('mockActive')
		}
		if (status.postgameMock !== this.mockPostgame) {
			this.mockPostgame = status.postgameMock
			affectedFeedbacks.add('mockActive')
		}
		if (status.postgameActiveComponent !== this.postgameActiveComponent) {
			this.postgameActiveComponent = status.postgameActiveComponent
			changedVariables['postgameComponent'] = status.postgameActiveComponent
			affectedFeedbacks.add('postgameComponentActive')
		}
		if (status.hotkeysEnabled !== this.hotkeysEnabled) {
			this.hotkeysEnabled = status.hotkeysEnabled
			changedVariables['hotkeysEnabled'] = status.hotkeysEnabled ? 'on' : 'off'
			affectedFeedbacks.add('hotkeysEnabled')
		}
		if (status.version !== this.appVersion) {
			this.appVersion = status.version
			changedVariables['appVersion'] = status.version
		}

		return { changedVariables, affectedFeedbacks: [...affectedFeedbacks] }
	}

	applySlowState(s: CompanionSlowStateDto): StateChange {
		const changedVariables: Record<string, string | number | undefined> = {}
		const previousLabel = this.currentSeriesLabel

		this.seriesList = s.series
		this.currentSeriesId = s.currentSeriesId && s.currentSeriesId > 0 ? s.currentSeriesId : null
		this.styleSets = {
			pregame: s.pregameStyleSets.filter((name): name is string => name !== null),
			ingame: s.ingameStyleSets.filter((name): name is string => name !== null),
			postgame: s.postgameStyleSets.filter((name): name is string => name !== null),
		}

		// The label depends on both the id and the list — recompute once after
		// every piece has been applied.
		const newLabel = this.currentSeriesLabel
		if (newLabel !== previousLabel) {
			changedVariables['currentSeries'] = newLabel
		}

		return { changedVariables, affectedFeedbacks: [] }
	}
}
