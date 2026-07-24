/* eslint-disable @typescript-eslint/unbound-method -- Vitest mock method assertions intentionally detach methods. */
import { describe, expect, it, vi } from 'vitest'
import { LeagueBroadcastCommands } from '../client/commands.js'
import type { CompanionSlowStateDto, CompanionStatusDto } from '../client/lb-types.js'
import type { LeagueBroadcastRpc } from '../client/rpc.js'

function createRpc(): LeagueBroadcastRpc {
	const ok = { ok: true, error: '', entryJson: '' }
	return {
		connect: vi.fn(),
		destroy: vi.fn(),
		connected: true,
		execute: vi.fn(async () => ok),
		getActiveOverlays: vi.fn(async () => []),
		getStatus: vi.fn(),
		getSlowState: vi.fn(),
		setMock: vi.fn(),
		showPostgameComponent: vi.fn(),
		clearPostgameComponent: vi.fn(),
		setOverlayShowing: vi.fn(),
		selectSeries: vi.fn(),
		setBestOf: vi.fn(),
		setGameResult: vi.fn(),
		swapSides: vi.fn(),
		activateStyleSet: vi.fn(),
		setHotkeysEnabled: vi.fn(),
		cinematicArm: vi.fn(),
		cinematicGo: vi.fn(),
		cinematicStop: vi.fn(),
		cinematicPlay: vi.fn(),
	}
}

describe('LeagueBroadcastCommands', () => {
	it('builds every caster command with the required discriminator and arguments', async () => {
		const rpc = createRpc()
		const commands = new LeagueBroadcastCommands(rpc)

		await commands.toggleOverlay('gold', true)
		await commands.pageSwitch('main')
		await commands.deactivateAll()
		await commands.damageSelectLatest()
		await commands.damageDeselect()
		await commands.objectiveSelectLatest(true)
		await commands.objectiveDeselect()
		await commands.teamfightStart()
		await commands.teamfightStop()
		await commands.teamfightSelectLatest()
		await commands.teamfightDeselect()
		await commands.championDetailPin(7)
		await commands.postgameShow(12)

		const calls = vi.mocked(rpc.execute).mock.calls.map(([command]) => command)
		expect(calls.map((command) => command.commandType)).toEqual([
			'toggle-overlay',
			'page-switch',
			'deactivate-all',
			'damage-select-latest',
			'damage-deselect',
			'objective-select-latest',
			'objective-deselect',
			'teamfight-start',
			'teamfight-stop',
			'teamfight-select-latest',
			'teamfight-deselect',
			'champion-detail-pin',
			'postgame-show',
		])
		expect(calls[0]).toMatchObject({ buttonId: 'gold', show: true })
		expect(calls[1]).toMatchObject({ pageId: 'main' })
		expect(calls[5]).toMatchObject({ dps: true })
		expect(calls[11]).toMatchObject({ playerIndex: 7 })
		expect(calls[12]).toMatchObject({ postgameId: 12, show: true })
		for (const command of calls) {
			expect(command.commandId).toMatch(/^[0-9a-f-]{36}$/i)
			expect(command.players).toEqual([])
		}
	})

	it('forwards the narrow Companion RPC methods and normalizes optional values', async () => {
		const rpc = createRpc()
		const status = { version: '7.3.0' } as CompanionStatusDto
		const slow = { series: [] } as CompanionSlowStateDto
		vi.mocked(rpc.getStatus).mockResolvedValue(status)
		vi.mocked(rpc.getSlowState).mockResolvedValue(slow)
		const commands = new LeagueBroadcastCommands(rpc)

		await expect(commands.getStatus()).resolves.toBe(status)
		await expect(commands.getSlowState()).resolves.toBe(slow)
		await commands.setMock('pregame', true)
		await commands.showPostgameComponent('mvp', 'player', undefined, undefined)
		await commands.clearPostgameComponent()
		await commands.setOverlayShowing('GoldGraph', false)
		await commands.selectSeries('42')
		await commands.setBestOf(5)
		await commands.setGameResult('blue')
		await commands.swapSides()
		await commands.activateStyleSet('ingame', 'dark')
		await commands.setHotkeysEnabled(true)
		await commands.cinematicArm('intro')
		await commands.cinematicGo()
		await commands.cinematicStop()
		await commands.cinematicPlay('outro')

		expect(rpc.setMock).toHaveBeenCalledWith('pregame', true)
		expect(rpc.showPostgameComponent).toHaveBeenCalledWith('mvp', 'player', -1, -1)
		expect(rpc.clearPostgameComponent).toHaveBeenCalledOnce()
		expect(rpc.setOverlayShowing).toHaveBeenCalledWith('GoldGraph', false)
		expect(rpc.selectSeries).toHaveBeenCalledWith(42)
		expect(rpc.setBestOf).toHaveBeenCalledWith(5)
		expect(rpc.setGameResult).toHaveBeenCalledWith('blue', 0)
		expect(rpc.swapSides).toHaveBeenCalledWith(0)
		expect(rpc.activateStyleSet).toHaveBeenCalledWith('ingame', 'dark')
		expect(rpc.setHotkeysEnabled).toHaveBeenCalledWith(true)
		expect(rpc.cinematicArm).toHaveBeenCalledWith('intro')
		expect(rpc.cinematicGo).toHaveBeenCalledOnce()
		expect(rpc.cinematicStop).toHaveBeenCalledOnce()
		expect(rpc.cinematicPlay).toHaveBeenCalledWith('outro')
	})

	it('preserves explicit current-game identifiers', async () => {
		const rpc = createRpc()
		const commands = new LeagueBroadcastCommands(rpc)
		await commands.showPostgameComponent('scoreboard', 'team', '1', 9)
		await commands.setGameResult('clear', 8)
		await commands.swapSides('11')

		expect(rpc.showPostgameComponent).toHaveBeenCalledWith('scoreboard', 'team', 1, 9)
		expect(rpc.setGameResult).toHaveBeenCalledWith('clear', 8)
		expect(rpc.swapSides).toHaveBeenCalledWith(11)
	})
})
