/**
 * Unit tests for the config helpers: the bonjour "address:port" port-stripping
 * endpoint parsing (resolveConfigEndpoint) and IPv6 URL bracketing
 * (formatHostForUrl).
 */

import { describe, expect, it } from 'vitest'
import { formatHostForUrl, resolveConfigEndpoint, resolveConfigHost, type ModuleConfig } from '../config.js'

function config(init: Partial<ModuleConfig> = {}): ModuleConfig {
	return { host: 'manual-host', port: 58869, ...init }
}

describe('resolveConfigHost', () => {
	it('empty bonjour selection falls back to the manual host', () => {
		expect(resolveConfigHost(config())).toBe('manual-host')
		expect(resolveConfigHost(config({ bonjourHost: '' }))).toBe('manual-host')
		expect(resolveConfigHost(config({ bonjourHost: null }))).toBe('manual-host')
	})

	it('IPv4:port strips the port', () => {
		expect(resolveConfigHost(config({ bonjourHost: '192.168.1.20:80' }))).toBe('192.168.1.20')
	})

	it('hostname:port strips the port', () => {
		expect(resolveConfigHost(config({ bonjourHost: 'broadcast-pc.local:80' }))).toBe('broadcast-pc.local')
	})

	it('a bare hostname passes through unchanged', () => {
		expect(resolveConfigHost(config({ bonjourHost: 'broadcast-pc' }))).toBe('broadcast-pc')
	})

	it('[IPv6]:port strips the brackets and the port', () => {
		expect(resolveConfigHost(config({ bonjourHost: '[fe80::1]:80' }))).toBe('fe80::1')
	})

	it('[IPv6] without a port strips the brackets', () => {
		expect(resolveConfigHost(config({ bonjourHost: '[fe80::1]' }))).toBe('fe80::1')
	})

	it('a bare IPv6 address passes through whole (no port stripping)', () => {
		expect(resolveConfigHost(config({ bonjourHost: 'fe80::1' }))).toBe('fe80::1')
	})

	it('ambiguous unbracketed IPv6-with-port keeps the WHOLE value (documented heuristic)', () => {
		// 'fe80::1:80' is itself a valid IPv6 address — stripping ':80' could
		// corrupt a genuine address, so 2+ colons without brackets = bare host.
		expect(resolveConfigHost(config({ bonjourHost: 'fe80::1:80' }))).toBe('fe80::1:80')
	})
})

describe('resolveConfigEndpoint', () => {
	it('uses the manual host and port when discovery is not selected', () => {
		expect(resolveConfigEndpoint(config({ host: 'manual', port: 59000 }))).toEqual({ host: 'manual', port: 59000 })
	})

	it('uses a valid port advertised by a fixed LeagueBroadcast build', () => {
		expect(resolveConfigEndpoint(config({ bonjourHost: '192.168.1.20:59000' }))).toEqual({
			host: '192.168.1.20',
			port: 59000,
		})
		expect(resolveConfigEndpoint(config({ bonjourHost: '[fe80::1]:59000' }))).toEqual({
			host: 'fe80::1',
			port: 59000,
		})
	})

	it('ignores the legacy hard-coded port 80 advertisement', () => {
		expect(resolveConfigEndpoint(config({ port: 58869, bonjourHost: 'broadcast-pc.local:80' }))).toEqual({
			host: 'broadcast-pc.local',
			port: 58869,
		})
	})

	it('falls back to the configured port for invalid or ambiguous advertised ports', () => {
		expect(resolveConfigEndpoint(config({ port: 58870, bonjourHost: 'broadcast-pc.local:0' }))).toEqual({
			host: 'broadcast-pc.local',
			port: 58870,
		})
		expect(resolveConfigEndpoint(config({ port: 58870, bonjourHost: 'fe80::1' }))).toEqual({
			host: 'fe80::1',
			port: 58870,
		})
	})
})

describe('formatHostForUrl', () => {
	it('brackets IPv6 literals', () => {
		expect(formatHostForUrl('fe80::1')).toBe('[fe80::1]')
	})

	it('leaves already-bracketed hosts alone', () => {
		expect(formatHostForUrl('[fe80::1]')).toBe('[fe80::1]')
	})

	it('leaves IPv4 addresses and hostnames alone', () => {
		expect(formatHostForUrl('192.168.1.20')).toBe('192.168.1.20')
		expect(formatHostForUrl('broadcast-pc.local')).toBe('broadcast-pc.local')
	})

	it('produces parseable http and ws URLs for every host shape', () => {
		for (const host of ['fe80::1', '[fe80::1]', 'fe80::1:80', '192.168.1.20', 'broadcast-pc.local']) {
			const formatted = formatHostForUrl(host)
			expect(URL.canParse(`http://${formatted}:58869`)).toBe(true)
			expect(URL.canParse(`ws://${formatted}:58869/ws/rpc`)).toBe(true)
		}
	})
})
