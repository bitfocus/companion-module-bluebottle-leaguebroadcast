import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	/**
	 * bonjour-device selection. Companion stores the picked announcement as
	 * `"address:port"`; empty/null/undefined means "Manual" (use `host`).
	 * Resolve through `resolveConfigEndpoint` — never read this directly.
	 */
	bonjourHost?: string | null
}

/**
 * Values of `secret-text` config fields. Companion keeps these in a separate
 * secrets store (not the config store) and delivers them alongside the config
 * in `init()`/`configUpdated()`.
 */
export interface ModuleSecrets {
	/**
	 * Remote pairing token (LeagueBroadcast → Settings → Remote Control).
	 * Empty/undefined on same-machine setups — loopback auto-authenticates.
	 */
	pairingToken?: string
}

/**
 * Effective endpoint: the bonjour-discovered address and advertised port when
 * one is selected, otherwise the manual host and port fields.
 *
 * LeagueBroadcast builds before the mDNS fix advertised port 80 regardless of
 * their real API port. Treat that one value as a legacy sentinel and keep the
 * configured port; valid non-80 advertisements from fixed builds are trusted.
 *
 * Parsing heuristic (the stored value is a plain string, so IPv6 makes an
 * unbracketed host+port ambiguous):
 * - contains `]` → bracketed IPv6 (`[fe80::1]:58869` or `[fe80::1]`).
 * - contains 2+ colons and no `]` → treat the WHOLE value as a bare IPv6 host
 *   and do not infer a port.
 * - one colon → `host:port`.
 * - no colon → bare host.
 */
export function resolveConfigEndpoint(config: ModuleConfig): { host: string; port: number } {
	const bonjour = (config.bonjourHost ?? '').trim()
	if (bonjour !== '') {
		let address: string
		let advertisedPort: number | undefined
		const closeBracket = bonjour.indexOf(']')
		if (closeBracket >= 0) {
			address = bonjour.slice(bonjour.startsWith('[') ? 1 : 0, closeBracket)
			const suffix = bonjour.slice(closeBracket + 1)
			if (/^:\d+$/.test(suffix)) advertisedPort = Number(suffix.slice(1))
		} else if (bonjour.indexOf(':') !== bonjour.lastIndexOf(':')) {
			address = bonjour // bare IPv6 — see heuristic above
		} else {
			const cut = bonjour.lastIndexOf(':')
			address = cut > 0 ? bonjour.slice(0, cut) : bonjour
			if (cut > 0 && /^\d+$/.test(bonjour.slice(cut + 1))) advertisedPort = Number(bonjour.slice(cut + 1))
		}
		if (address !== '') {
			const port =
				advertisedPort !== undefined && advertisedPort >= 1 && advertisedPort <= 65535 && advertisedPort !== 80
					? advertisedPort
					: config.port
			return { host: address, port }
		}
	}
	return { host: config.host, port: config.port }
}

/** Backwards-compatible host-only helper used by tests and external imports. */
export function resolveConfigHost(config: ModuleConfig): string {
	return resolveConfigEndpoint(config).host
}

/**
 * Format a host for embedding in a URL: IPv6 literals (any host containing a
 * colon) must be bracketed; already-bracketed values and everything else pass
 * through unchanged. Used for both the REST base URL and the RPC ws URL.
 */
export function formatHostForUrl(host: string): string {
	return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			// Companion watches the manifest's bonjourQueries entry of the same id
			// (`_leaguebroadcast._tcp`) and offers discovered apps here; "Manual"
			// (empty) falls back to the host field below.
			type: 'bonjour-device',
			id: 'bonjourHost',
			label: 'LeagueBroadcast (discovered)',
			tooltip: 'Pick a LeagueBroadcast instance found on the network, or Manual to enter a hostname/IP yourself',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'LeagueBroadcast Host',
			tooltip: 'Hostname or IP of the machine running LeagueBroadcast',
			width: 8,
			regex: Regex.HOSTNAME,
			default: '127.0.0.1',
			isVisibleExpression: '!$(options:bonjourHost)',
		},
		{
			type: 'static-text',
			id: 'hostFiller',
			label: 'LeagueBroadcast Host',
			value: 'Using the discovered address and port (legacy port 80 falls back to the port below)',
			width: 8,
			isVisibleExpression: '!!$(options:bonjourHost)',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			tooltip: 'LeagueBroadcast local API port',
			width: 4,
			min: 1,
			max: 65535,
			default: 58869,
		},
		{
			type: 'secret-text',
			id: 'pairingToken',
			label: 'Pairing token (remote only)',
			tooltip:
				'Only needed when Companion runs on a different machine than LeagueBroadcast. ' +
				'Generate in LeagueBroadcast → Settings → Remote Control. Leave empty on the same machine.',
			width: 12,
			default: '',
		},
	]
}
