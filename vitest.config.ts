import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/__tests__/**/*.spec.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			reportsDirectory: 'coverage',
			include: ['src/config.ts', 'src/state.ts', 'src/client/commands.ts', 'src/client/rpc.ts'],
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 80,
				lines: 80,
			},
		},
		// Generous but bounded — the RPC integration tests run real sockets and
		// reconnect cycles (tuned to milliseconds via the RpcTuning test hook).
		testTimeout: 15_000,
		hookTimeout: 15_000,
	},
})
