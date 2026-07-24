import { describe, expect, it } from 'vitest'
import { UpgradeScripts } from '../upgrades.js'

describe('UpgradeScripts', () => {
	it('rewrites the retired GoldGraphV2 choice without touching unrelated entries', () => {
		const props = {
			config: {},
			secrets: {},
			actions: [
				{ actionId: 'overlaySet', options: { overlayKey: 'GoldGraphV2' } },
				{ actionId: 'overlaySet', options: { overlayKey: 'Teamfight' } },
			],
			feedbacks: [
				{ feedbackId: 'overlayActive', options: { overlayName: 'GoldGraphV2' } },
				{ feedbackId: 'connected', options: {} },
			],
		}

		const result = UpgradeScripts[0]({} as never, props as never)

		expect(props.actions.map((action) => action.options.overlayKey)).toEqual(['GoldGraph', 'Teamfight'])
		expect(props.feedbacks[0].options.overlayName).toBe('GoldGraph')
		expect(result.updatedActions).toEqual([props.actions[0]])
		expect(result.updatedFeedbacks).toEqual([props.feedbacks[0]])
		expect(result.updatedConfig).toBeNull()
	})

	it('returns empty migrations when no saved choice needs rewriting', () => {
		const props = {
			config: {},
			secrets: {},
			actions: [{ actionId: 'overlaySet', options: { overlayKey: 'GoldGraph' } }],
			feedbacks: [{ feedbackId: 'overlayActive', options: { overlayName: 'GoldGraph' } }],
		}

		const result = UpgradeScripts[0]({} as never, props as never)

		expect(result.updatedActions).toEqual([])
		expect(result.updatedFeedbacks).toEqual([])
	})
})
