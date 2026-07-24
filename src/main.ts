import { InstanceBase, runEntrypoint, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, resolveConfigEndpoint, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { LeagueBroadcastState } from './state.js'
import {
	createRpcClient,
	isAuthError,
	isTierError,
	type LeagueBroadcastRpc,
	type RpcConnectionEvent,
} from './client/rpc.js'
import { LeagueBroadcastCommands } from './client/commands.js'
import type { CasterCommandResultDto, CasterPanelStateDto } from './client/lb-types.js'

const POLL_INTERVAL_MS = 5000
/**
 * Every Nth fast tick also runs the slow series/style-set poll
 * (6 × 5 s = 30 s) — those lists change at human speed.
 */
const SLOW_POLL_EVERY_TICKS = 6
/**
 * Logged (never shown as instance status) when the app rejects a gated call
 * for tier reasons. Tier limitation surfaces exclusively through the `tier`
 * variable and the `tierEntitled` feedback — the free tier stays fully usable,
 * so the instance status must not degrade over it.
 */
const TIER_MESSAGE = 'Companion control requires the LeagueBroadcast Basic tier'
/** WebSocket upgrade answered HTTP 401 — the pairing token was sent and rejected (fail closed). */
const INVALID_TOKEN_MESSAGE = 'Invalid pairing token — generate a new one in LeagueBroadcast Settings → Remote Control'
/** Gated call answered RpcError 401 "Not authenticated" — remote connection in anonymous scope. */
const AUTH_REQUIRED_MESSAGE = 'This connection needs a pairing token (LeagueBroadcast Settings → Remote Control)'

function isUnauthorizedMessage(message: string): boolean {
	return message.toLowerCase().includes('unauthorized')
}

export class ModuleInstance extends InstanceBase<ModuleConfig, ModuleSecrets> {
	config!: ModuleConfig // Setup in init()
	/** secret-text config values (Companion's separate secrets store). Setup in init(). */
	secrets: ModuleSecrets = {}
	state = new LeagueBroadcastState()
	/** `null` until a host is configured — action callbacks must guard (see actions.ts). */
	commands: LeagueBroadcastCommands | null = null

	private rpc: LeagueBroadcastRpc | null = null
	private pollTimer: NodeJS.Timeout | null = null
	private pollInFlight = false
	private lastChoicesHash = ''
	/** Host the current connection cycle targets (bonjour-discovered or manual) — for status messages. */
	private effectiveHost = ''
	/** Port the current connection cycle targets (advertised or configured) — for status messages. */
	private effectivePort = 0
	/**
	 * One-shot latch: the last connect attempt's WebSocket upgrade was rejected
	 * with HTTP 401 (invalid pairing token). Consumed by the next 'reconnecting'
	 * event so the AuthenticationFailure status survives the reconnect loop's
	 * own status updates; re-armed by every rejected retry, cleared on connect.
	 */
	private upgradeRejected401 = false
	/** Fast ticks remaining until the next slow (series/style-set) poll; 0 = due now. */
	private slowPollCountdown = 0
	/**
	 * Bumped by setupConnection/teardownConnection/destroy. Async continuations
	 * (handleConnected and pollTick) capture it at entry and
	 * re-check after every await — a stale cycle's landing continuation must
	 * never touch the new cycle's state, status, or variables.
	 */
	private connectionGeneration = 0

	constructor(internal: unknown) {
		super(internal)
	}

	get rpcConnected(): boolean {
		return this.rpc?.connected ?? false
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets ?? {}

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export presets
		this.updateVariableDefinitions() // export variable definitions

		this.setupConnection()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		this.connectionGeneration++
		this.teardownConnection()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		// A changed pairing token flows through here: teardown drops the old
		// transport, setupConnection passes the new token to createRpcClient.
		this.teardownConnection()
		this.config = config
		this.secrets = secrets ?? {}
		this.setupConnection()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// --- connection lifecycle ---

	private setupConnection(): void {
		this.connectionGeneration++
		const { host, port } = resolveConfigEndpoint(this.config)
		if (!host) {
			// Drop any clients from the previous cycle BEFORE going BadConfig —
			// action callbacks must find null (and log cleanly) instead of firing
			// stale requests at the old host. teardownConnection already dropped
			// the rpc in the configUpdated path; the guard covers every path.
			this.commands = null
			if (this.rpc) {
				this.rpc.destroy()
				this.rpc = null
			}
			this.updateStatus(InstanceStatus.BadConfig, 'No host configured')
			return
		}
		this.effectiveHost = host
		this.effectivePort = port
		this.updateStatus(InstanceStatus.Connecting)

		this.state = new LeagueBroadcastState()
		this.state.connectionState = 'connecting'
		this.lastChoicesHash = this.state.choicesHash()
		this.upgradeRejected401 = false
		this.slowPollCountdown = 0
		this.initVariableValues()

		const rpc = createRpcClient(host, port, this.secrets.pairingToken)
		this.rpc = rpc
		this.commands = new LeagueBroadcastCommands(rpc)
		rpc.onConnectionEvent = (ev, reconnectAttempt) => this.handleConnectionEvent(ev, reconnectAttempt)
		rpc.onPanelState = (panel) => this.handlePanelState(panel)
		rpc.onCinematicPlayback = (playing) => this.handleCinematicPlayback(playing)
		rpc.onUpgradeRejected = (statusCode) => this.handleUpgradeRejected(statusCode)
		rpc.onSubscribeError = (subscription, err) => {
			if (isAuthError(err)) {
				this.markAuthRequired()
				return
			}
			if (isTierError(err)) {
				this.markTierLimited()
				return
			}
			this.log('warn', `Subscription ${subscription} failed: ${err.message}`)
		}
		rpc.connect()

		// Poll only while the authenticated RPC transport is connected. While
		// disconnected, variables intentionally keep their last known values.
		this.pollTimer = setInterval(() => void this.pollTick(), POLL_INTERVAL_MS)
	}

	private teardownConnection(): void {
		this.connectionGeneration++
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
		this.pollInFlight = false
		if (this.rpc) {
			this.rpc.onConnectionEvent = undefined
			this.rpc.onPanelState = undefined
			this.rpc.onCinematicPlayback = undefined
			this.rpc.onSubscribeError = undefined
			this.rpc.destroy()
			this.rpc = null
		}
	}

	private initVariableValues(): void {
		this.setVariableValues({
			gamePhase: 'none',
			blueTeamName: '',
			redTeamName: '',
			currentSeries: '',
			activePage: '',
			activeOverlayCount: 0,
			postgameComponent: '',
			hotkeysEnabled: '',
			tier: 'ok',
			appVersion: '',
			connectionState: this.state.connectionState,
		})
	}

	private handleConnectionEvent(ev: RpcConnectionEvent, reconnectAttempt?: number): void {
		// state.connectionState is the single source for the connectionState
		// variable — publish only when the value actually changed.
		const change = this.state.applyConnectionState(ev)
		if (Object.keys(change.changedVariables).length > 0) {
			this.setVariableValues(change.changedVariables)
		}
		if (change.affectedFeedbacks.length > 0) {
			this.checkFeedbacks(...change.affectedFeedbacks)
		}

		switch (ev) {
			case 'reconnecting':
				// A 401-rejected upgrade fires onUpgradeRejected right before this
				// event — consume the latch so the AuthenticationFailure status is
				// not clobbered by the reconnect loop's own updates. The loop keeps
				// retrying: the user may fix the token app-side at any time, and
				// the runtime's backoff paces the attempts.
				if (this.upgradeRejected401) {
					this.upgradeRejected401 = false
					this.updateStatus(InstanceStatus.AuthenticationFailure, INVALID_TOKEN_MESSAGE)
				} else if (reconnectAttempt !== undefined && reconnectAttempt >= 3) {
					// The runtime retries forever (maxReconnectAttempts: Infinity), so
					// 'reconnect-failed' never fires on its own — surface an unreachable
					// app by attempt count instead while the retry loop keeps running.
					this.updateStatus(
						InstanceStatus.ConnectionFailure,
						`LeagueBroadcast not reachable at ${this.effectiveHost}:${this.effectivePort} — is the app running?`,
					)
				} else {
					this.updateStatus(InstanceStatus.Connecting)
				}
				break
			case 'connected':
				this.upgradeRejected401 = false
				void this.handleConnected()
				break
			case 'reconnect-failed':
				this.updateStatus(
					InstanceStatus.ConnectionFailure,
					`LeagueBroadcast not reachable at ${this.effectiveHost}:${this.effectivePort} — is the app running?`,
				)
				break
			case 'invalid-url':
				// Terminal for this cycle: no ws URL could be built, no reconnect
				// loop is running. Only a config change starts a new cycle.
				this.log(
					'error',
					`Invalid host or port — cannot build a URL from "${this.effectiveHost}" port ${this.effectivePort}`,
				)
				this.updateStatus(InstanceStatus.ConnectionFailure, 'Invalid host or port')
				break
			case 'disconnected':
				this.updateStatus(InstanceStatus.Disconnected)
				break
		}
	}

	/**
	 * The WebSocket upgrade came back as a plain HTTP response instead of 101
	 * (pairing-token path only). 401 = the server rejected the token at upgrade
	 * (fail closed) — latch it for the 'reconnecting' event that follows and
	 * surface the failure immediately.
	 */
	private handleUpgradeRejected(statusCode: number): void {
		if (statusCode === 401) {
			this.upgradeRejected401 = true
			this.updateStatus(InstanceStatus.AuthenticationFailure, INVALID_TOKEN_MESSAGE)
		} else {
			this.log('warn', `WebSocket upgrade rejected with HTTP ${statusCode} — check host and port`)
		}
	}

	private async handleConnected(): Promise<void> {
		const generation = this.connectionGeneration
		const rpc = this.rpc
		if (!rpc) return

		// Fresh-cycle reset of the sticky tier flag. This is the ONLY place it
		// clears: a clean poll, a successful command, or a successful
		// getActiveOverlays call prove nothing about tier entitlement (those
		// calls are auth-gated but not tier-gated, or plain ungated), so
		// clearing on any of them would flap the variable/feedback against the
		// gated rejections every few seconds. After this reset, the first gated
		// rejection of the new cycle re-sets the flag — so a tier upgrade in
		// the app takes effect on the next (re)connect.
		this.clearTierLimited()
		// Auth/liveness probe ONLY — the result is deliberately discarded.
		// The panel-state subscription is the authoritative state source: the
		// server pushes a full snapshot on every (re)subscribe and the runtime
		// replays subscriptions on reconnect, so state population happens
		// exclusively through applyPanelState.
		try {
			await rpc.getActiveOverlays()
			if (generation !== this.connectionGeneration) return
		} catch (err) {
			if (generation !== this.connectionGeneration) return
			const message = err instanceof Error ? err.message : String(err)
			if (isAuthError(err)) {
				// Remote connection accepted in anonymous scope (no/expired pairing
				// token): every gated call answers 401 "Not authenticated". Distinct
				// from the tier limitation — pairing, not upgrading, is the fix,
				// and this IS a status-worthy failure (nothing works without auth).
				this.markAuthRequired()
				return
			}
			if (isTierError(err)) {
				this.markTierLimited()
			} else {
				this.log('warn', `Liveness probe failed: ${message}`)
			}
		}

		// Kick a poll cycle immediately — the interval only ticks while
		// connected — and make it a full one: an app restart may have changed
		// the series/style-set lists, so the slow poll must not wait out its
		// 30 s cadence after a reconnect.
		this.slowPollCountdown = 0
		void this.pollTick()

		// Ok unconditionally: tier limitation is variable/feedback state, not
		// connection state — the status never carries it.
		this.updateStatus(InstanceStatus.Ok)
	}

	private handlePanelState(panel: CasterPanelStateDto): void {
		// Runs synchronously in the subscription dispatch path — a throw here
		// must never propagate (it would take down the module process).
		try {
			const change = this.state.applyPanelState(panel)
			if (Object.keys(change.changedVariables).length > 0) {
				this.setVariableValues(change.changedVariables)
			}
			if (change.affectedFeedbacks.length > 0) {
				this.checkFeedbacks(...change.affectedFeedbacks)
			}

			this.rebuildDefinitionsIfChoicesChanged()
		} catch (err) {
			this.log('error', `Panel state handling failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	/**
	 * Rebuild action & feedback definitions only when the dynamic dropdown
	 * sources (pages/buttons/overlay names/series/style sets) actually changed
	 * — never per state tick.
	 */
	private rebuildDefinitionsIfChoicesChanged(): void {
		const hash = this.state.choicesHash()
		if (hash !== this.lastChoicesHash) {
			this.lastChoicesHash = hash
			this.updateActions()
			this.updateFeedbacks()
		}
	}

	private handleCinematicPlayback(playing: boolean): void {
		// Subscription dispatch path — contain throws (see handlePanelState).
		try {
			if (this.state.cinematicPlaying === playing) return
			this.state.cinematicPlaying = playing
			this.checkFeedbacks('cinematicPlaying')
		} catch (err) {
			this.log('error', `Cinematic playback handling failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	private async pollTick(): Promise<void> {
		// Poll only while the RPC transport is connected — on disconnect the
		// polled state freezes and variables keep their last values.
		const commands = this.commands
		if (this.pollInFlight || !commands || !this.rpcConnected) return
		const generation = this.connectionGeneration
		this.pollInFlight = true
		try {
			const status = await commands.getStatus()
			if (generation !== this.connectionGeneration) return
			const change = this.state.applyStatus(status)
			if (Object.keys(change.changedVariables).length > 0) {
				this.setVariableValues(change.changedVariables)
			}
			if (change.affectedFeedbacks.length > 0) {
				this.checkFeedbacks(...change.affectedFeedbacks)
			}
			// Slow cycle (series list, current series, style sets) every
			// SLOW_POLL_EVERY_TICKS fast ticks — those change at human speed.
			const slowDue = this.slowPollCountdown <= 0
			this.slowPollCountdown = slowDue ? SLOW_POLL_EVERY_TICKS - 1 : this.slowPollCountdown - 1
			if (slowDue) {
				await this.slowPollTick(generation)
				if (generation !== this.connectionGeneration) return
			}
		} catch (err) {
			if (generation !== this.connectionGeneration) return
			if (isAuthError(err)) {
				this.markAuthRequired()
			} else if (isTierError(err)) {
				this.markTierLimited()
			} else {
				this.log('debug', `Poll failed: ${err instanceof Error ? err.message : String(err)}`)
			}
		} finally {
			// Only the current cycle may clear its own overlap guard — a stale
			// cycle's landing poll must not unblock the new cycle's in-flight
			// gate (teardownConnection already reset the flag for the new cycle).
			if (generation === this.connectionGeneration) {
				this.pollInFlight = false
			}
		}
	}

	/** One slow poll: fetch + apply series/style-set state, then rebuild dropdowns if they changed. */
	private async slowPollTick(generation: number): Promise<void> {
		const commands = this.commands
		if (!commands) return
		const slow = await commands.getSlowState()
		if (generation !== this.connectionGeneration) return
		const change = this.state.applySlowState(slow)
		if (Object.keys(change.changedVariables).length > 0) {
			this.setVariableValues(change.changedVariables)
		}
		if (change.affectedFeedbacks.length > 0) {
			this.checkFeedbacks(...change.affectedFeedbacks)
		}
		this.rebuildDefinitionsIfChoicesChanged()
	}

	/**
	 * Pull the slow-polled series/style-set state forward: mark it due and
	 * kick a poll cycle now (used by actions that just changed series state).
	 * If a poll is already in flight the kick is dropped, but the due marker
	 * holds — the next 5 s tick runs the slow poll instead.
	 */
	requestSlowRefresh(): void {
		this.slowPollCountdown = 0
		void this.pollTick()
	}

	// --- connection auth (remote pairing) ---

	/**
	 * A gated RPC call was rejected because the connection is unauthenticated
	 * (remote, anonymous scope). Recovery is a new paired connection: the user
	 * enters a token (configUpdated rebuilds), so no clear-side twin is needed —
	 * a successfully paired connect cycle sets Ok through handleConnected.
	 */
	markAuthRequired(): void {
		this.updateStatus(InstanceStatus.AuthenticationFailure, AUTH_REQUIRED_MESSAGE)
	}

	// --- tier gating ---

	/**
	 * Sticky per-connection-cycle flag: the app rejected a gated call for tier
	 * reasons. Surfaces ONLY through the `tier` variable and the `tierEntitled`
	 * feedback — NEVER through the instance status (AuthenticationFailure is
	 * reserved for pairing/auth; the free tier stays fully usable, so the
	 * status stays Ok). Cleared exclusively by handleConnected: nothing short
	 * of a fresh connect cycle proves tier entitlement.
	 */
	markTierLimited(): void {
		if (this.state.tierLimited) return
		this.state.tierLimited = true
		this.setVariableValues({ tier: 'limited' })
		this.checkFeedbacks('tierEntitled')
		// One line per connection cycle (the flag only resets in
		// handleConnected), not one per 5 s poll.
		this.log('info', `${TIER_MESSAGE} — gated controls stay inactive on this tier`)
	}

	private clearTierLimited(): void {
		if (!this.state.tierLimited) return
		this.state.tierLimited = false
		this.setVariableValues({ tier: 'ok' })
		this.checkFeedbacks('tierEntitled')
	}

	// --- error handling helpers used by actions.ts ---

	handleCommandResult(actionId: string, result: CasterCommandResultDto): void {
		if (result.ok) {
			// Deliberately NO clearTierLimited on success: one command working
			// does not prove entitlement for every gated feature — clearing here
			// would flap the tier variable/feedback (see handleConnected).
			return
		}
		if (isUnauthorizedMessage(result.error)) {
			this.markTierLimited()
		}
		// Always log the app's own message at error level so the operator sees
		// WHY the button did nothing.
		this.log('error', `${actionId}: command failed: ${result.error}`)
	}

	handleCommandError(actionId: string, err: unknown): void {
		const message = err instanceof Error ? err.message : String(err)
		if (isAuthError(err)) {
			this.markAuthRequired()
			this.log('warn', `${actionId}: ${message}`)
			return
		}
		if (isTierError(err)) {
			this.markTierLimited()
			// Error level, with the app's message: the button visibly did
			// nothing, and this log line is the operator's only explanation
			// (the instance status deliberately stays Ok).
			this.log('error', `${actionId}: ${message}`)
			return
		}
		this.log('error', `${actionId}: ${message}`)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
