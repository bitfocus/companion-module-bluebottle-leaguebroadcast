import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeResult,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

/**
 * Upgrade scripts are APPEND-ONLY, FOREVER: Companion tracks per connection
 * how many scripts have already run (by array index), so once a script has
 * shipped in a release it must never be removed, reordered, or edited in a
 * way that changes its behavior. Replace an obsolete script with
 * EmptyUpgradeScript if it must be neutralized.
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = [
	/*
	 * v0.1.0 → v0.2.0: the overlaySet action and overlayActive feedback briefly
	 * used the app catalog's ACTION id 'GoldGraphV2'; the wire actually keys on
	 * the serialization property name 'GoldGraph' (see OVERLAY_CATALOG in
	 * choices.ts). v0.1.0 was never distributed, but the rewrite is kept as
	 * cheap insurance for any config that saved the old id.
	 */
	function upgradeGoldGraphV2ToGoldGraph(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets>,
	): CompanionStaticUpgradeResult<ModuleConfig, ModuleSecrets> {
		const updatedActions: CompanionMigrationAction[] = []
		const updatedFeedbacks: CompanionMigrationFeedback[] = []

		for (const action of props.actions) {
			if (action.actionId === 'overlaySet' && action.options.overlayKey === 'GoldGraphV2') {
				action.options.overlayKey = 'GoldGraph'
				updatedActions.push(action)
			}
		}
		for (const feedback of props.feedbacks) {
			if (feedback.feedbackId === 'overlayActive' && feedback.options.overlayName === 'GoldGraphV2') {
				feedback.options.overlayName = 'GoldGraph'
				updatedFeedbacks.push(feedback)
			}
		}

		// Return ONLY what changed — Companion persists exactly these.
		return {
			updatedConfig: null,
			updatedActions,
			updatedFeedbacks,
		}
	},
]
