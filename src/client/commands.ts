/**
 * Transport-agnostic command facade used by actions.ts.
 *
 * All caster-seam commands funnel through `companion.ExecuteCasterCommand(CasterCommandDto)`
 * via the RPC client. Actions never construct DTOs or pick a transport
 * themselves — they call this facade.
 */

import { randomUUID } from 'node:crypto'
import type {
	CasterCommandDto,
	CasterCommandResultDto,
	CasterCommandType,
	CompanionSlowStateDto,
	CompanionStatusDto,
	GameWinnerSelection,
	MockPhase,
	PostgameScope,
	StylePhase,
} from './lb-types.js'
import type { LeagueBroadcastRpc } from './rpc.js'

/**
 * Build a complete CasterCommandDto from a partial.
 *
 * Field defaults mirror the app's expectations: every unset numeric field is
 * -1 (NOT 0), strings default to '', players to [], booleans to false, and a
 * fresh commandId is generated per command.
 */
export function buildCommand(partial: Partial<CasterCommandDto>): CasterCommandDto {
	return {
		roomName: '',
		commandId: randomUUID(),
		senderMemberId: '',
		senderName: '',
		commandType: '',
		buttonId: '',
		postgameId: -1,
		show: false,
		timePeriod: -1,
		team: -1,
		players: [],
		playerIndex: -1,
		displayMode: -1,
		dps: false,
		pageId: '',
		clearTargeting: false,
		...partial,
	}
}

export class LeagueBroadcastCommands {
	private readonly rpc: LeagueBroadcastRpc

	constructor(rpc: LeagueBroadcastRpc) {
		this.rpc = rpc
	}

	private async execute(
		partial: Partial<CasterCommandDto> & { commandType: CasterCommandType },
	): Promise<CasterCommandResultDto> {
		return this.rpc.execute(buildCommand(partial))
	}

	async toggleOverlay(buttonId: string, show: boolean): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'toggle-overlay', buttonId, show })
	}

	async pageSwitch(pageId: string): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'page-switch', pageId })
	}

	async deactivateAll(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'deactivate-all' })
	}

	async damageSelectLatest(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'damage-select-latest' })
	}

	async damageDeselect(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'damage-deselect' })
	}

	async objectiveSelectLatest(dps: boolean): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'objective-select-latest', dps })
	}

	async objectiveDeselect(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'objective-deselect' })
	}

	async teamfightStart(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'teamfight-start' })
	}

	async teamfightStop(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'teamfight-stop' })
	}

	async teamfightSelectLatest(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'teamfight-select-latest' })
	}

	async teamfightDeselect(): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'teamfight-deselect' })
	}

	async championDetailPin(playerIndex: number): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'champion-detail-pin', playerIndex })
	}

	async postgameShow(postgameId: number): Promise<CasterCommandResultDto> {
		return this.execute({ commandType: 'postgame-show', postgameId, show: true })
	}

	async getStatus(): Promise<CompanionStatusDto> {
		return this.rpc.getStatus()
	}

	async getSlowState(): Promise<CompanionSlowStateDto> {
		return this.rpc.getSlowState()
	}

	async setMock(phase: MockPhase, enabled: boolean): Promise<void> {
		return this.rpc.setMock(phase, enabled)
	}

	async showPostgameComponent(
		componentType: string,
		scope: PostgameScope,
		teamSide?: string | number,
		playerIndex?: number,
	): Promise<void> {
		return this.rpc.showPostgameComponent(componentType, scope, Number(teamSide ?? -1), playerIndex ?? -1)
	}

	async clearPostgameComponent(): Promise<void> {
		return this.rpc.clearPostgameComponent()
	}

	async setOverlayShowing(overlayName: string, show: boolean): Promise<void> {
		return this.rpc.setOverlayShowing(overlayName, show)
	}

	async selectSeries(seriesId: string): Promise<void> {
		return this.rpc.selectSeries(Number(seriesId))
	}

	async setBestOf(bestOf: number): Promise<void> {
		return this.rpc.setBestOf(bestOf)
	}

	async setGameResult(selection: GameWinnerSelection, gameId?: number): Promise<void> {
		return this.rpc.setGameResult(selection, gameId ?? 0)
	}

	async swapSides(seriesId?: string): Promise<void> {
		return this.rpc.swapSides(Number(seriesId ?? 0))
	}

	async activateStyleSet(phase: StylePhase, name: string): Promise<void> {
		return this.rpc.activateStyleSet(phase, name)
	}

	async setHotkeysEnabled(enabled: boolean): Promise<void> {
		return this.rpc.setHotkeysEnabled(enabled)
	}

	// --- cinematics ---

	/** Arm a cinematic: loaded and paused at its start, ready for an instant Go. */
	async cinematicArm(id: string): Promise<void> {
		return this.rpc.cinematicArm(id)
	}

	/** Start the armed cinematic. No-op in the app if nothing is armed. */
	async cinematicGo(): Promise<void> {
		return this.rpc.cinematicGo()
	}

	/** Stop playback and tear the cinematic down (HUD/fog restored). */
	async cinematicStop(): Promise<void> {
		return this.rpc.cinematicStop()
	}

	/** Arm + Go in one step. */
	async cinematicPlay(id: string): Promise<void> {
		return this.rpc.cinematicPlay(id)
	}
}
