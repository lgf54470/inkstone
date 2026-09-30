import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'

/**
 * Reports one failed blog mutation. The handling lives here rather than at each call site for two
 * reasons: the store is where the optimistic change has to be undone, and the callers that wrote
 * `void updatePost(...)` had nothing to catch — the rejection was an unhandled promise, the row
 * kept a change the server had refused, and nothing on screen said so.
 */
export function reportBlogMutationError(error: unknown): void {
  console.error('Blog mutation failed', error)
  useUi.getState().toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
}

/**
 * Runs a mutation that answers only whether it went through (`false` after reporting the failure).
 * `refresh` runs only on success, so a request that failed never overwrites the list it could not
 * change.
 */
export async function runBlogMutation(request: () => Promise<unknown>, refresh?: () => Promise<unknown>): Promise<boolean> {
  try {
    await request()
    if (refresh) await refresh()
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  }
}
