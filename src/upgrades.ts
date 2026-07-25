import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

/**
 * Upgrade scripts are APPEND-ONLY, FOREVER: Companion tracks per connection
 * how many scripts have already run (by array index), so once a script has
 * shipped in a release it must never be removed, reordered, or edited in a
 * way that changes its behavior. Replace an obsolete script with
 * EmptyUpgradeScript if it must be neutralized.
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = []
