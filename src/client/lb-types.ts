/**
 * DTO types of the LeagueBroadcast RPC surface.
 *
 * Re-exported from the vendored generated stub (src/vendor/generated/) so the
 * module's types can never drift from the app's RPC schema — re-vendoring the
 * stubs updates these too. Only `CasterCommandType` is defined here: the set of
 * command strings accepted by `companion.ExecuteCasterCommand` is app behavior, not part
 * of the generated schema.
 */

export type {
	CasterActiveOverlayDto,
	CasterButtonDto,
	CasterCommandDto,
	CasterCommandResultDto,
	CasterPageStateDto,
	CasterPanelStateDto,
	CasterPlayerPickDto,
	CasterPostgameButtonDto,
	CasterRosterEntryDto,
	CompanionSeriesSummaryDto,
	CompanionSlowStateDto,
	CompanionStatusDto,
} from '../vendor/generated/companion-rpc.js'

export type MockPhase = 'pregame' | 'ingame' | 'postgame'
export type PostgameScope = 'current' | 'team' | 'player'
export type StylePhase = MockPhase
export type GameWinnerSelection = 'blue' | 'red' | 'clear'

/** The command types accepted by `companion.ExecuteCasterCommand` (CasterCommandDto.commandType). */
export type CasterCommandType =
	| 'toggle-overlay'
	| 'deactivate-all'
	| 'postgame-show'
	| 'champion-detail-pin'
	| 'damage-select-latest'
	| 'damage-deselect'
	| 'objective-select-latest'
	| 'objective-deselect'
	| 'teamfight-select-latest'
	| 'teamfight-start'
	| 'teamfight-stop'
	| 'teamfight-deselect'
	| 'page-switch'
