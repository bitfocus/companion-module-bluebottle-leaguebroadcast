import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default generateEslintConfig({
	enableTypescript: true,
	// Vendored code (RPC runtime + generated stubs) is copied verbatim from the
	// LeagueBroadcast repo and must not be reformatted or lint-fixed here.
	ignores: ['src/vendor/**'],
}).then((config) => [
	...config,
	{
		// Test infra never ships in the packaged module (excluded from
		// tsconfig.build.json; webpack bundles only dist/main.js), so importing
		// devDependencies (vitest) there is fine — same carve-out the shared
		// config already makes for eslint.config.*.
		files: ['src/__tests__/**', 'vitest.config.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
])
