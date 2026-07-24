/**
 * Mock LeagueBroadcast RPC server for integration tests.
 *
 * A real `ws` WebSocketServer on an ephemeral loopback port speaking the exact
 * wire protocol of the vendored @bluebottle/rpc runtime
 * (src/vendor/bluebottle-rpc/index.ts):
 *
 *   Frame    = Envelope + Payload
 *   Envelope = 0xBB magic (1) | u16 BE content length | content
 *   content  = kind:u8 | id:u32 BE (unless Event) | u16 BE textLen + utf8 text
 *              (method for Request, channel for Event)
 *   kinds    : Request=0, Response=1, Error=2, Event=3
 *   Error payload (follows a kind=2 envelope):
 *              0xEE magic (1) | u16 BE length | id:u32 BE | code:i32 BE |
 *              u16 BE msgLen + utf8 message
 *   Payload  = raw FlatBuffer bytes (args / response), built with the vendored
 *              FlatBufferWriter exactly like the generated build*_Args helpers.
 *
 * Frame-construction patterns mirror the framework's own reconnect.spec.ts.
 */

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { WebSocketServer, type WebSocket as WsSocket, type RawData } from 'ws'
import { FlatBufferReader, FlatBufferWriter } from '../../vendor/bluebottle-rpc/index.js'
import type {
	CasterCommandDto,
	CasterCommandResultDto,
	CasterPanelStateDto,
	CasterPlayerPickDto,
	CompanionSlowStateDto,
	CompanionStatusDto,
} from '../../client/lb-types.js'
import { makePanelState } from './fixtures.js'

const ENVELOPE_MAGIC = 0xbb
const ERROR_MAGIC = 0xee

const KIND_REQUEST = 0
const KIND_RESPONSE = 1
const KIND_ERROR = 2
const KIND_EVENT = 3

/** Channel names the mock mints for subscriptions (returned in the subscribe response payload). */
export const PANEL_CHANNEL = 'companion.panel_state'
export const PLAYBACK_CHANNEL = 'companion.cinematic_playback'

// ─── Generic wait helper ─────────────────────────────────────────────

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll `probe` until it returns a truthy value; bounded by `timeoutMs`. */
export async function until<T>(probe: () => T | undefined | null | false, what: string, timeoutMs = 5000): Promise<T> {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const value = probe()
		if (value !== undefined && value !== null && value !== false) return value
		if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`)
		await delay(5)
	}
}

// ─── Wire codec (server side) ────────────────────────────────────────

export interface DecodedRequest {
	id: number
	method: string
	payload: Uint8Array
}

/** Decode a client Request frame (mirror of the runtime's decodeEnvelope, Request branch). */
export function decodeRequestFrame(data: Uint8Array): DecodedRequest {
	if (data.length < 4 || data[0] !== ENVELOPE_MAGIC) throw new Error('Mock server: missing envelope magic byte')
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	const contentLen = view.getUint16(1, false) // big-endian
	const kind = data[3]
	if (kind !== KIND_REQUEST) throw new Error(`Mock server: expected Request frame, got kind ${kind}`)
	const id = view.getUint32(4, false)
	const methodLen = view.getUint16(8, false)
	const method = new TextDecoder().decode(data.subarray(10, 10 + methodLen))
	const envelopeEnd = 3 + contentLen
	const payload = envelopeEnd < data.length ? data.subarray(envelopeEnd) : new Uint8Array(0)
	return { id, method, payload }
}

/** Build a Response frame: envelope(kind=1, id) + payload. */
export function encodeResponseFrame(id: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
	const contentLen = 1 + 4 // kind + id
	const buf = new Uint8Array(3 + contentLen + payload.length)
	const view = new DataView(buf.buffer)
	buf[0] = ENVELOPE_MAGIC
	view.setUint16(1, contentLen, false)
	buf[3] = KIND_RESPONSE
	view.setUint32(4, id, false)
	buf.set(payload, 8)
	return buf
}

/** Build an Error frame: envelope(kind=2, id) + error payload (0xEE | len | id | code | msg). */
export function encodeErrorFrame(id: number, code: number, message: string): Uint8Array {
	const msg = new TextEncoder().encode(message)
	const errPayload = new Uint8Array(3 + 4 + 4 + 2 + msg.length)
	const errView = new DataView(errPayload.buffer)
	errPayload[0] = ERROR_MAGIC
	errView.setUint16(1, errPayload.length - 3, false)
	errView.setUint32(3, id, false)
	errView.setInt32(7, code, false)
	errView.setUint16(11, msg.length, false)
	errPayload.set(msg, 13)

	const contentLen = 1 + 4
	const buf = new Uint8Array(3 + contentLen + errPayload.length)
	const view = new DataView(buf.buffer)
	buf[0] = ENVELOPE_MAGIC
	view.setUint16(1, contentLen, false)
	buf[3] = KIND_ERROR
	view.setUint32(4, id, false)
	buf.set(errPayload, 8)
	return buf
}

/** Build an Event frame: envelope(kind=3, channel — no id) + payload. */
export function encodeEventFrame(channel: string, payload: Uint8Array): Uint8Array {
	const channelBytes = new TextEncoder().encode(channel)
	const contentLen = 1 + 2 + channelBytes.length // kind + textLen + text
	const buf = new Uint8Array(3 + contentLen + payload.length)
	const view = new DataView(buf.buffer)
	buf[0] = ENVELOPE_MAGIC
	view.setUint16(1, contentLen, false)
	buf[3] = KIND_EVENT
	view.setUint16(4, channelBytes.length, false)
	buf.set(channelBytes, 6)
	buf.set(payload, 3 + contentLen)
	return buf
}

// ─── FlatBuffer DTO builders (mirror the generated build*_Args slot layouts) ─

function buildPlayerPick(v: CasterPlayerPickDto): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeInt(0, v.team)
	w.writeInt(1, v.role)
	return w.finish(2)
}

function buildButton(v: CasterPanelStateDto['ingameButtons'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeString(0, v.buttonId)
	w.writeString(1, v.name)
	w.writeString(2, v.overlayName)
	w.writeString(3, v.backgroundColor)
	w.writeBool(4, v.hasSettings)
	w.writeBool(5, v.allowSinglePlayers)
	w.writeBool(6, v.allowTimePeriod)
	w.writeBool(7, v.available)
	w.writeString(8, v.pageId)
	w.writeInt(9, v.position)
	w.writeString(10, v.label)
	w.writeString(11, v.actionType)
	w.writeString(12, v.targetPageId)
	w.writeBool(13, v.allowTeams)
	return w.finish(14)
}

function buildPostgameButton(v: CasterPanelStateDto['postgameButtons'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeInt(0, v.id)
	w.writeString(1, v.name)
	w.writeString(2, v.componentName)
	w.writeString(3, v.backgroundColor)
	w.writeBool(4, v.allowPlayers)
	w.writeBool(5, v.allowTeams)
	w.writeBool(6, v.requiresCompletedGame)
	w.writeBool(7, v.available)
	return w.finish(8)
}

function buildActiveOverlay(v: CasterPanelStateDto['activeOverlays'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeString(0, v.overlayName)
	w.writeString(1, v.buttonId)
	w.writeInt(2, v.timePeriod)
	w.writeInt(3, v.team)
	w.writeTableVector(
		4,
		v.players.map((p) => buildPlayerPick(p)),
	)
	return w.finish(5)
}

function buildRosterEntry(v: CasterPanelStateDto['roster'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeInt(0, v.playerIndex)
	w.writeString(1, v.summonerName)
	w.writeString(2, v.championName)
	w.writeInt(3, v.team)
	return w.finish(4)
}

function buildPageState(v: CasterPanelStateDto['pages'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeString(0, v.pageId)
	w.writeString(1, v.name)
	w.writeInt(2, v.order)
	return w.finish(3)
}

/**
 * Build a wire CasterPanelStateDto buffer from a plain (partial) JS object —
 * slot layout mirrors buildCasterPanelStateDto_Args in the generated stubs.
 */
export function buildPanelStateBuffer(init: Partial<CasterPanelStateDto>): Uint8Array {
	const v = makePanelState(init)
	const w = new FlatBufferWriter()
	w.writeString(0, v.roomName)
	w.writeLong(1, v.revision)
	w.writeBool(2, v.sessionActive)
	w.writeInt(3, v.gamePhase)
	w.writeString(4, v.gameName)
	w.writeString(5, v.blueTeamName)
	w.writeString(6, v.redTeamName)
	w.writeTableVector(
		7,
		v.ingameButtons.map((e) => buildButton(e)),
	)
	w.writeTableVector(
		8,
		v.postgameButtons.map((e) => buildPostgameButton(e)),
	)
	w.writeTableVector(
		9,
		v.activeOverlays.map((e) => buildActiveOverlay(e)),
	)
	w.writeStringVector(10, v.disabledOverlays)
	w.writeTableVector(
		11,
		v.roster.map((e) => buildRosterEntry(e)),
	)
	w.writeTableVector(
		12,
		v.pages.map((e) => buildPageState(e)),
	)
	w.writeString(13, v.activePageId)
	w.writeBool(14, v.rosterHidden)
	w.writeBool(15, v.eventFeedHidden)
	w.writeBool(16, v.teamfightHidden)
	w.writeBool(17, v.postgameHidden)
	return w.finish(18)
}

export function buildCommandResultBuffer(v: CasterCommandResultDto): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeBool(0, v.ok)
	w.writeString(1, v.error)
	w.writeString(2, v.entryJson)
	return w.finish(3)
}

function buildActiveOverlaysBuffer(overlays: (string | null)[]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeStringVector(0, overlays)
	return w.finish(1)
}

function buildStatusBuffer(status: CompanionStatusDto): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeString(0, status.version)
	w.writeBool(1, status.championSelectMock)
	w.writeBool(2, status.ingameMock)
	w.writeBool(3, status.postgameMock)
	w.writeString(4, status.postgameActiveComponent)
	w.writeBool(5, status.hotkeysEnabled)
	return w.finish(6)
}

function buildSeriesSummary(v: CompanionSlowStateDto['series'][number]): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeUInt(0, v.id)
	w.writeString(1, v.label)
	w.writeBool(2, v.completed)
	return w.finish(3)
}

function buildSlowStateBuffer(state: CompanionSlowStateDto): Uint8Array {
	const w = new FlatBufferWriter()
	if (state.currentSeriesId !== undefined) w.writeUInt(0, state.currentSeriesId)
	w.writeTableVector(
		1,
		state.series.map((series) => buildSeriesSummary(series)),
	)
	w.writeStringVector(2, state.pregameStyleSets)
	w.writeStringVector(3, state.ingameStyleSets)
	w.writeStringVector(4, state.postgameStyleSets)
	return w.finish(5)
}

export interface PlaybackInit {
	cinematicId?: string
	time?: number
	length?: number
	state?: string
	playing: boolean
}

/**
 * Build the CinematicPlayback event buffer. Slot layout (FlatSharp table):
 * cinematic_id:string(0), time:float(1), length:float(2), state:string(3),
 * playing:bool(4).
 */
export function buildPlaybackBuffer(init: PlaybackInit): Uint8Array {
	const w = new FlatBufferWriter()
	w.writeString(0, init.cinematicId ?? 'cine-1')
	w.writeFloat(1, init.time ?? 0)
	w.writeFloat(2, init.length ?? 0)
	w.writeString(3, init.state ?? (init.playing ? 'playing' : 'stopped'))
	w.writeBool(4, init.playing)
	return w.finish(5)
}

// ─── Server-side arg decoding ────────────────────────────────────────

function decodePlayerPick(r: FlatBufferReader): CasterPlayerPickDto {
	return { team: r.readInt(0), role: r.readInt(1) }
}

function decodeCasterCommand(r: FlatBufferReader): CasterCommandDto {
	return {
		roomName: r.readString(0) ?? '',
		commandId: r.readString(1) ?? '',
		senderMemberId: r.readString(2) ?? '',
		senderName: r.readString(3) ?? '',
		commandType: r.readString(4) ?? '',
		buttonId: r.readString(5) ?? '',
		postgameId: r.readInt(6),
		show: r.readBool(7),
		timePeriod: r.readInt(8),
		team: r.readInt(9),
		players: r.readTableVector(10, decodePlayerPick) ?? [],
		playerIndex: r.readInt(11),
		displayMode: r.readInt(12),
		dps: r.readBool(13),
		pageId: r.readString(14) ?? '',
		clearTargeting: r.readBool(15),
	}
}

/** Decode `companion.execute_caster_command` request args: { cmd: table(0) }. */
export function decodeExecuteArgs(payload: Uint8Array): CasterCommandDto {
	const cmd = new FlatBufferReader(payload).readTable(0, decodeCasterCommand)
	if (!cmd) throw new Error('Mock server: execute args missing cmd table')
	return cmd
}

// ─── Mock server ─────────────────────────────────────────────────────

export interface RecordedConnection {
	/** All upgrade-request headers as received. */
	headers: IncomingHttpHeaders
	origin: string | undefined
	authorization: string | undefined
	socket: WsSocket
}

export interface RecordedRequest {
	id: number
	method: string
	payload: Uint8Array
	connection: RecordedConnection
}

export type MockHandlerResult = { payload?: Uint8Array } | { error: { code: number; message: string } }
export type MockHandler = (req: RecordedRequest) => MockHandlerResult

function toUint8(data: RawData): Uint8Array {
	if (Array.isArray(data)) {
		const merged = Buffer.concat(data)
		return new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength)
	}
	if (data instanceof ArrayBuffer) return new Uint8Array(data)
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

export class MockLbServer {
	/** Every accepted WebSocket connection, in accept order. */
	readonly connections: RecordedConnection[] = []
	/** Every decoded request frame, in arrival order (across all connections). */
	readonly requests: RecordedRequest[] = []
	/** Decoded CasterCommandDto of every `companion.execute_caster_command` call. */
	readonly executeCommands: CasterCommandDto[] = []

	/** Non-null → reject the next upgrade(s) with this raw HTTP status (e.g. 401). */
	rejectUpgradeWithStatus: number | null = null
	/** Canned command result (used unless `executeError` is set). */
	executeResult: CasterCommandResultDto = { ok: true, error: '', entryJson: '' }
	/** Non-null → answer the next command with this error envelope instead. */
	executeError: { code: number; message: string } | null = null
	/** Canned `companion.get_active_overlays` names. */
	activeOverlays: string[] = []
	status: CompanionStatusDto = {
		version: '7.3.0',
		championSelectMock: false,
		ingameMock: false,
		postgameMock: false,
		postgameActiveComponent: '',
		hotkeysEnabled: true,
	}
	slowState: CompanionSlowStateDto = {
		currentSeriesId: 1,
		series: [{ id: 1, label: 'Blue vs Red', completed: false }],
		pregameStyleSets: ['clean'],
		ingameStyleSets: ['dark'],
		postgameStyleSets: ['results'],
	}

	private readonly httpServer: Server
	private readonly wss: WebSocketServer
	private readonly handlers = new Map<string, MockHandler>()
	private readonly panelSubscribers = new Set<WsSocket>()
	private readonly playbackSubscribers = new Set<WsSocket>()
	private listeningPort = 0

	private constructor() {
		this.httpServer = createServer()
		this.wss = new WebSocketServer({ noServer: true })

		this.httpServer.on('upgrade', (req, socket, head) => {
			if (this.rejectUpgradeWithStatus !== null) {
				// Reject the upgrade with a plain HTTP response (the app fails closed
				// on an invalid pairing token this way) — the ws client surfaces it
				// as 'unexpected-response'.
				const status = this.rejectUpgradeWithStatus
				socket.end(`HTTP/1.1 ${status} Rejected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`)
				return
			}
			this.wss.handleUpgrade(req, socket, head, (ws) => {
				this.wss.emit('connection', ws, req)
			})
		})

		this.wss.on('connection', (ws: WsSocket, req) => {
			const connection: RecordedConnection = {
				headers: req.headers,
				origin: req.headers.origin,
				authorization: req.headers.authorization,
				socket: ws,
			}
			this.connections.push(connection)
			ws.on('message', (data: RawData) => this.handleMessage(ws, connection, toUint8(data)))
			ws.on('close', () => {
				this.panelSubscribers.delete(ws)
				this.playbackSubscribers.delete(ws)
			})
		})

		// Canned method handlers (overridable via setHandler).
		this.handlers.set('ping.echo', () => ({}))
		this.handlers.set('companion.get_active_overlays', () => ({
			payload: buildActiveOverlaysBuffer(this.activeOverlays),
		}))
		this.handlers.set('companion.get_status', () => ({ payload: buildStatusBuffer(this.status) }))
		this.handlers.set('companion.get_slow_state', () => ({ payload: buildSlowStateBuffer(this.slowState) }))
		this.handlers.set('companion.execute_caster_command', (req) => {
			this.executeCommands.push(decodeExecuteArgs(req.payload))
			if (this.executeError) return { error: this.executeError }
			return { payload: buildCommandResultBuffer(this.executeResult) }
		})
		this.handlers.set('companion.subscribe_panel_state', (req) => {
			this.panelSubscribers.add(req.connection.socket)
			return { payload: new TextEncoder().encode(PANEL_CHANNEL) }
		})
		this.handlers.set('companion.subscribe_cinematic_playback', (req) => {
			this.playbackSubscribers.add(req.connection.socket)
			return { payload: new TextEncoder().encode(PLAYBACK_CHANNEL) }
		})
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
			this.handlers.set(method, () => ({}))
		}
	}

	static async start(): Promise<MockLbServer> {
		const server = new MockLbServer()
		await new Promise<void>((resolve, reject) => {
			server.httpServer.once('error', reject)
			server.httpServer.listen(0, '127.0.0.1', () => resolve())
		})
		const address = server.httpServer.address()
		if (address === null || typeof address === 'string') throw new Error('Mock server: no bound port')
		server.listeningPort = address.port
		return server
	}

	get port(): number {
		return this.listeningPort
	}

	/** Replace the canned handler for a method (e.g. to return an error envelope). */
	setHandler(method: string, handler: MockHandler): void {
		this.handlers.set(method, handler)
	}

	/** Resolve once the `count`-th request for `method` has been received. */
	async waitForRequest(method: string, count = 1, timeoutMs = 5000): Promise<RecordedRequest> {
		return until(
			() => this.requests.filter((r) => r.method === method)[count - 1],
			`request #${count} for ${method}`,
			timeoutMs,
		)
	}

	/** Resolve once the `count`-th WebSocket connection has been accepted. */
	async waitForConnection(count = 1, timeoutMs = 5000): Promise<RecordedConnection> {
		return until(() => this.connections[count - 1], `connection #${count}`, timeoutMs)
	}

	/** Push a panel-state Event frame (built from a plain object) to all panel subscribers. */
	pushPanelState(init: Partial<CasterPanelStateDto>): void {
		this.pushEvent(this.panelSubscribers, PANEL_CHANNEL, buildPanelStateBuffer(init))
	}

	/** Push a CinematicPlayback Event frame to all playback subscribers. */
	pushPlayback(init: PlaybackInit): void {
		this.pushEvent(this.playbackSubscribers, PLAYBACK_CHANNEL, buildPlaybackBuffer(init))
	}

	/** Number of sockets currently subscribed to the panel-state channel. */
	get panelSubscriberCount(): number {
		return this.panelSubscribers.size
	}

	/** Server-side hard drop of every open connection (client should reconnect). */
	killAllConnections(): void {
		for (const client of this.wss.clients) client.terminate()
	}

	async close(): Promise<void> {
		this.killAllConnections()
		await new Promise<void>((resolve) => this.wss.close(() => resolve()))
		await new Promise<void>((resolve) => this.httpServer.close(() => resolve()))
	}

	private pushEvent(subscribers: Set<WsSocket>, channel: string, payload: Uint8Array): void {
		if (subscribers.size === 0) throw new Error(`Mock server: no subscribers on ${channel}`)
		const frame = encodeEventFrame(channel, payload)
		for (const ws of subscribers) {
			if (ws.readyState === ws.OPEN) ws.send(frame)
		}
	}

	private handleMessage(ws: WsSocket, connection: RecordedConnection, data: Uint8Array): void {
		const decoded = decodeRequestFrame(data)
		const request: RecordedRequest = { ...decoded, connection }
		this.requests.push(request)

		const handler = this.handlers.get(request.method)
		const result: MockHandlerResult = handler
			? handler(request)
			: { error: { code: 404, message: `Unknown method: ${request.method}` } }

		if ('error' in result) {
			ws.send(encodeErrorFrame(request.id, result.error.code, result.error.message))
		} else {
			ws.send(encodeResponseFrame(request.id, result.payload ?? new Uint8Array(0)))
		}
	}
}
