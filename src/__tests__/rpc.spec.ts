/**
 * End-to-end transport tests: the module's real createRpcClient (vendored
 * @bluebottle/rpc runtime + generated stubs) against a mock LeagueBroadcast
 * RPC server speaking the actual wire protocol (real `ws` sockets, real
 * FlatBuffer payloads — see helpers/mockLbServer.ts).
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
	createRpcClient,
	isAuthError,
	isLoopbackHost,
	isTierError,
	type LeagueBroadcastRpc,
	type RpcConnectionEvent,
	type RpcTuning,
} from '../client/rpc.js'
import { buildCommand } from '../client/commands.js'
import type { CasterPanelStateDto } from '../client/lb-types.js'
import { MockLbServer, until } from './helpers/mockLbServer.js'
import { makeButton, makeOverlay, makePage, makePostgameButton, makeRosterEntry } from './helpers/fixtures.js'

/** Millisecond-scale reconnect cycles via the documented test-only tuning hook. */
const FAST_TUNING: RpcTuning = { reconnectDelay: 25, maxReconnectDelay: 50, reconnectJitter: 1, heartbeatIntervalMs: 0 }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Per-test lifecycle (no fixed ports, no hanging handles) ─────────

const servers: MockLbServer[] = []
const transports: LeagueBroadcastRpc[] = []

afterEach(async () => {
	for (const transport of transports) transport.destroy()
	transports.length = 0
	for (const server of servers) await server.close()
	servers.length = 0
})

async function startServer(): Promise<MockLbServer> {
	const server = await MockLbServer.start()
	servers.push(server)
	return server
}

interface TransportRecorder {
	transport: LeagueBroadcastRpc
	events: { ev: RpcConnectionEvent; attempt?: number }[]
	panelStates: CasterPanelStateDto[]
	playback: boolean[]
	rejectedUpgrades: number[]
	subscribeErrors: { subscription: string; err: Error }[]
}

function createTransport(server: MockLbServer, opts: { token?: string; tuning?: RpcTuning } = {}): TransportRecorder {
	const transport = createRpcClient('127.0.0.1', server.port, opts.token, opts.tuning)
	transports.push(transport)
	const recorder: TransportRecorder = {
		transport,
		events: [],
		panelStates: [],
		playback: [],
		rejectedUpgrades: [],
		subscribeErrors: [],
	}
	transport.onConnectionEvent = (ev, attempt) => recorder.events.push({ ev, attempt })
	transport.onPanelState = (state) => recorder.panelStates.push(state)
	transport.onCinematicPlayback = (playing) => recorder.playback.push(playing)
	transport.onUpgradeRejected = (status) => recorder.rejectedUpgrades.push(status)
	transport.onSubscribeError = (subscription, err) => recorder.subscribeErrors.push({ subscription, err })
	return recorder
}

async function connect(recorder: TransportRecorder): Promise<void> {
	recorder.transport.connect()
	await until(() => recorder.transport.connected, 'transport connected')
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise
	} catch (err) {
		return err
	}
	throw new Error('expected the promise to reject')
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('loopback (no pairing token)', () => {
	it('recognizes explicit loopback hosts so production disables the heartbeat', () => {
		for (const host of [
			'localhost',
			'LOCALHOST.',
			'worker.localhost',
			'127.0.0.1',
			'127.12.34.56',
			'::1',
			'[::1]',
			'0:0:0:0:0:0:0:1',
			'::ffff:127.0.0.1',
			'[::1%3]',
		]) {
			expect(isLoopbackHost(host), host).toBe(true)
		}

		for (const host of ['192.168.1.20', '10.0.0.5', 'broadcast-pc.local', 'example.com', '::2']) {
			expect(isLoopbackHost(host), host).toBe(false)
		}
	})

	it('connects with NO Origin/Authorization headers and round-trips execute()', async () => {
		const server = await startServer()
		server.executeResult = { ok: true, error: '', entryJson: '{"entry":1}' }
		// No tuning: this test runs the untouched production RpcClient options.
		const recorder = createTransport(server)
		await connect(recorder)

		const connection = await server.waitForConnection()
		expect(connection.origin).toBeUndefined()
		expect(connection.authorization).toBeUndefined()

		const result = await recorder.transport.execute(
			buildCommand({ commandType: 'toggle-overlay', buttonId: 'btn-gold', show: true }),
		)
		expect(result).toEqual({ ok: true, error: '', entryJson: '{"entry":1}' })

		// Server-side decode of the CasterCommandDto asserts wire defaults.
		expect(server.executeCommands).toHaveLength(1)
		const cmd = server.executeCommands[0]
		expect(cmd.commandType).toBe('toggle-overlay')
		expect(cmd.buttonId).toBe('btn-gold')
		expect(cmd.show).toBe(true)
		expect(cmd.commandId).toMatch(UUID_RE)
		// Unset numerics travel as -1 (NOT 0), strings as '', players as [].
		expect(cmd.postgameId).toBe(-1)
		expect(cmd.timePeriod).toBe(-1)
		expect(cmd.team).toBe(-1)
		expect(cmd.playerIndex).toBe(-1)
		expect(cmd.displayMode).toBe(-1)
		expect(cmd.roomName).toBe('')
		expect(cmd.senderMemberId).toBe('')
		expect(cmd.senderName).toBe('')
		expect(cmd.pageId).toBe('')
		expect(cmd.players).toEqual([])
		expect(cmd.dps).toBe(false)
		expect(cmd.clearTargeting).toBe(false)
	})
})

describe('invalid host/port', () => {
	it('an unbuildable ws URL fires a synchronous invalid-url event and never connects', () => {
		// Spaces make the URL unparseable; validation happens before any
		// RpcClient (and its reconnect loop) is constructed.
		const transport = createRpcClient('not a valid host', 58869)
		transports.push(transport)
		const events: RpcConnectionEvent[] = []
		transport.onConnectionEvent = (ev) => events.push(ev)
		transport.connect()
		expect(events).toEqual(['invalid-url'])
		expect(transport.connected).toBe(false)
	})
})

describe('pairing token', () => {
	it('sends the allowlisted Origin plus Authorization: Bearer <token>', async () => {
		const server = await startServer()
		const recorder = createTransport(server, { token: 'tok-secret-1', tuning: FAST_TUNING })
		await connect(recorder)

		const connection = await server.waitForConnection()
		expect(connection.origin).toBe('http://companion.bluebottle.invalid')
		expect(connection.authorization).toBe('Bearer tok-secret-1')
	})

	it('upgrade rejected with 401: onUpgradeRejected fires and reconnects keep coming', async () => {
		const server = await startServer()
		server.rejectUpgradeWithStatus = 401
		const recorder = createTransport(server, { token: 'tok-revoked', tuning: FAST_TUNING })
		recorder.transport.connect()

		// Multiple rejected attempts prove the reconnect loop keeps scheduling.
		await until(() => recorder.rejectedUpgrades.length >= 3, 'three rejected upgrade attempts')
		expect(recorder.rejectedUpgrades.every((status) => status === 401)).toBe(true)
		expect(recorder.transport.connected).toBe(false)

		const reconnecting = recorder.events.filter((e) => e.ev === 'reconnecting')
		expect(reconnecting.length).toBeGreaterThanOrEqual(2)
		expect(reconnecting[0].attempt).toBe(1)
		expect(reconnecting[1].attempt).toBe(2)

		// And once the token is accepted again, the same loop connects.
		server.rejectUpgradeWithStatus = null
		await until(() => recorder.transport.connected, 'reconnect after server stops rejecting')
	})
})

describe('panel-state subscription', () => {
	it('a pushed snapshot reaches onPanelState with correctly decoded fields', async () => {
		const server = await startServer()
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)
		await server.waitForRequest('companion.subscribe_panel_state')

		server.pushPanelState({
			revision: 7_000_000_123n, // > 2^32 — exercises the i64/bigint slot
			gamePhase: 2,
			gameName: 'Game 3',
			blueTeamName: 'Blüe Öyster', // non-ASCII exercises utf8 strings
			redTeamName: 'Red Dragons',
			pages: [
				makePage({ pageId: 'page-1', name: 'Main', order: 0 }),
				makePage({ pageId: 'page-2', name: 'Alt', order: 1 }),
			],
			ingameButtons: [
				makeButton({ buttonId: 'btn-gold', available: false, pageId: 'page-2', actionType: 'page-switch' }),
			],
			postgameButtons: [makePostgameButton({ id: 7, name: '', componentName: 'mvp' })],
			activeOverlays: [
				makeOverlay({ overlayName: 'GoldGraph', buttonId: 'btn-gold', players: [{ team: 1, role: 2 }] }),
			],
			disabledOverlays: ['Teamfight'],
			activePageId: 'page-2',
			roster: [makeRosterEntry({ playerIndex: 3, summonerName: 'Faker', championName: 'Azir', team: 1 })],
		})

		const state = await until(() => recorder.panelStates[0], 'panel-state push')
		expect(state.revision).toBe(7_000_000_123n)
		expect(state.gamePhase).toBe(2)
		expect(state.gameName).toBe('Game 3')
		expect(state.blueTeamName).toBe('Blüe Öyster')
		expect(state.redTeamName).toBe('Red Dragons')
		expect(state.pages.map((p) => [p.pageId, p.name, p.order])).toEqual([
			['page-1', 'Main', 0],
			['page-2', 'Alt', 1],
		])
		expect(state.ingameButtons).toHaveLength(1)
		expect(state.ingameButtons[0].buttonId).toBe('btn-gold')
		expect(state.ingameButtons[0].available).toBe(false)
		expect(state.ingameButtons[0].pageId).toBe('page-2')
		expect(state.ingameButtons[0].actionType).toBe('page-switch')
		expect(state.postgameButtons).toHaveLength(1)
		expect(state.postgameButtons[0].id).toBe(7)
		expect(state.postgameButtons[0].componentName).toBe('mvp')
		expect(state.activeOverlays).toHaveLength(1)
		expect(state.activeOverlays[0].overlayName).toBe('GoldGraph')
		expect(state.activeOverlays[0].buttonId).toBe('btn-gold')
		expect(state.activeOverlays[0].players).toEqual([{ team: 1, role: 2 }])
		expect(state.disabledOverlays).toEqual(['Teamfight'])
		expect(state.activePageId).toBe('page-2')
		expect(state.roster).toEqual([{ playerIndex: 3, summonerName: 'Faker', championName: 'Azir', team: 1 }])
		expect(recorder.subscribeErrors).toEqual([])
	})

	it('re-issues the subscription automatically after a server-side drop', async () => {
		const server = await startServer()
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)
		await server.waitForRequest('companion.subscribe_panel_state')

		await until(() => {
			server.pushPanelState({ revision: 1n, blueTeamName: 'Before' })
			return recorder.panelStates.find((state) => state.revision === 1n)
		}, 'panel-state push before drop')

		// Hard server-side drop: the runtime must reconnect AND replay the
		// tracked subscription without any app-level help.
		server.killAllConnections()
		await server.waitForRequest('companion.subscribe_panel_state', 2)
		await until(() => recorder.transport.connected, 'reconnect after drop')

		const state = await until(() => {
			server.pushPanelState({ revision: 2n, blueTeamName: 'After' })
			return recorder.panelStates.find((panel) => panel.revision === 2n)
		}, 'panel-state push after reconnect')
		expect(state.revision).toBe(2n)
		expect(state.blueTeamName).toBe('After')
		expect(recorder.events.some((e) => e.ev === 'disconnected')).toBe(true)
		expect(recorder.events.filter((e) => e.ev === 'connected').length).toBeGreaterThanOrEqual(2)
	})
})

describe('execute() error mapping', () => {
	it('401 "Not authenticated" maps to AuthRequiredError (isAuthError, not isTierError)', async () => {
		const server = await startServer()
		server.executeError = { code: 401, message: 'Not authenticated' }
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)

		const err = await captureRejection(recorder.transport.execute(buildCommand({ commandType: 'deactivate-all' })))
		expect(isAuthError(err)).toBe(true)
		expect(isTierError(err)).toBe(false)
	})

	it('401 "Requires feature: BasicTier" maps to TierError (isTierError, not isAuthError)', async () => {
		const server = await startServer()
		server.executeError = { code: 401, message: 'Requires feature: BasicTier' }
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)

		const err = await captureRejection(recorder.transport.execute(buildCommand({ commandType: 'deactivate-all' })))
		expect(isTierError(err)).toBe(true)
		expect(isAuthError(err)).toBe(false)
	})

	it('a 500 is neither auth nor tier and is rethrown with context', async () => {
		const server = await startServer()
		server.executeError = { code: 500, message: 'internal boom' }
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)

		const err = await captureRejection(recorder.transport.execute(buildCommand({ commandType: 'deactivate-all' })))
		expect(isAuthError(err)).toBe(false)
		expect(isTierError(err)).toBe(false)
		expect(err).toBeInstanceOf(Error)
		expect((err as Error).message).toContain('companion.execute_caster_command failed')
		expect((err as Error).message).toContain('internal boom')
	})
})

describe('unary calls', () => {
	it('reads the authenticated Companion state snapshots', async () => {
		const server = await startServer()
		server.activeOverlays = ['GoldGraph', 'Teamfight']
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)

		await expect(recorder.transport.getActiveOverlays()).resolves.toEqual(['GoldGraph', 'Teamfight'])
		await expect(recorder.transport.getStatus()).resolves.toEqual(server.status)
		await expect(recorder.transport.getSlowState()).resolves.toEqual(server.slowState)
	})

	it('exposes exactly the mutation calls used by Companion', async () => {
		const server = await startServer()
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)

		await recorder.transport.setMock('pregame', true)
		await recorder.transport.showPostgameComponent('mvp', 'player', 1, 7)
		await recorder.transport.clearPostgameComponent()
		await recorder.transport.setOverlayShowing('GoldGraph', true)
		await recorder.transport.selectSeries(3)
		await recorder.transport.setBestOf(5)
		await recorder.transport.setGameResult('blue', 1)
		await recorder.transport.swapSides(3)
		await recorder.transport.activateStyleSet('ingame', 'dark')
		await recorder.transport.setHotkeysEnabled(false)
		await recorder.transport.cinematicArm('intro')
		await recorder.transport.cinematicGo()
		await recorder.transport.cinematicPlay('outro')
		await recorder.transport.cinematicStop()

		const methods = server.requests.map((request) => request.method)
		for (const method of [
			'companion.set_mock',
			'companion.show_postgame_component',
			'companion.clear_postgame_component',
			'companion.set_overlay_showing',
			'companion.select_series',
			'companion.set_best_of',
			'companion.set_game_result',
			'companion.swap_sides',
			'companion.activate_style_set',
			'companion.set_hotkeys_enabled',
			'companion.cinematic_arm',
			'companion.cinematic_go',
			'companion.cinematic_play',
			'companion.cinematic_stop',
		]) {
			expect(methods).toContain(method)
		}
	})
})

describe('cinematics playback subscription', () => {
	it('playing=true/false event frames drive onCinematicPlayback in order', async () => {
		const server = await startServer()
		const recorder = createTransport(server, { tuning: FAST_TUNING })
		await connect(recorder)
		await server.waitForRequest('companion.subscribe_cinematic_playback')

		server.pushPlayback({ cinematicId: 'cine-7', time: 1.5, length: 12.25, state: 'playing', playing: true })
		await until(() => recorder.playback.length >= 1, 'first playback event')
		server.pushPlayback({ cinematicId: 'cine-7', time: 12.25, length: 12.25, state: 'stopped', playing: false })
		await until(() => recorder.playback.length >= 2, 'second playback event')

		expect(recorder.playback).toEqual([true, false])
		expect(recorder.subscribeErrors).toEqual([])
	})
})
