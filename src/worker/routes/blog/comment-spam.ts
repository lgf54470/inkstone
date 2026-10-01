/**
 * What the spam rules make of a reader's comment (FEA-06). The rules are deliberately simple and
 * pure — they run before the row exists, and the score they produce is stored with it so the
 * moderation list can say why a submission was parked instead of leaving the author to guess.
 */

/** At or above this score a submission is stored as spam instead of published or queued. */
export const COMMENT_SPAM_THRESHOLD = 3

export interface CommentSpamRules {
  /** Words the author blacklisted, matched case-insensitively as plain substrings. */
  keywords: readonly string[]
}

export interface CommentSpamVerdict {
  score: number
  /** Why the score is what it is, in the order the rules fired. */
  reasons: string[]
}

export interface CommentSpamInput {
  content: string
  authorName: string
  authorUrl?: string | null
}

/** A link the comment carries: what a spam robot is usually there to leave behind. */
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/gi

/** At least one letter, digit or CJK character: punctuation alone is not a comment. */
const WORD_PATTERN = /[\p{L}\p{N}]/u

/**
 * Scores one submission. The rules are additive and each explains itself; three points is the
 * threshold, so one link alone (1) never parks a comment while three links, one blacklisted word,
 * or a link plus punctuation-only content does.
 */
export function scoreComment(input: CommentSpamInput, rules: CommentSpamRules): CommentSpamVerdict {
  const reasons: string[] = []
  let score = 0

  const links = input.content.match(LINK_PATTERN)?.length ?? 0
  if (links >= 3) {
    score += 3
    reasons.push('many-links')
  } else if (links >= 1) {
    score += 1
    reasons.push('link')
  }

  const haystack = `${input.content}\n${input.authorName}\n${input.authorUrl ?? ''}`.toLowerCase()
  const hitKeywords = rules.keywords.filter((keyword) => keyword && haystack.includes(keyword.toLowerCase()))
  if (hitKeywords.length > 0) {
    // A word the author named is decisive on its own; a second distinct hit adds three more while a
    // blacklist of several words for the same scheme does not multiply into a score nobody can read
    // back from the stored number.
    score += Math.min(hitKeywords.length, 2) * 3
    reasons.push('keyword')
  }

  if (!WORD_PATTERN.test(input.content)) {
    score += 2
    reasons.push('no-words')
  }

  return { score, reasons }
}
