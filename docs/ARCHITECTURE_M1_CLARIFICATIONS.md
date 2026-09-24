# FitQuest — Architecture Recovery Addendum Assignment

Status: Completed by **Architecture** and accepted by HQ on 2026-09-23 as the M1 recovery baseline. See the [complete addendum](proposals/M1_RECOVERY_ADDENDUM.md) and [HQ review](reviews/FOLLOWUP_REVIEW.md). The original assignment is retained below; implementation, runtime verification, and hosted changes are not authorized by this document.

Read [M1_ARCHITECTURE_REVIEW.md](reviews/M1_ARCHITECTURE_REVIEW.md), the [source proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md), and current DECISIONS/HANDOFF documents. Do not repeat the initial audit, reconsider the approved stack, or expand M1.

Return an addendum addressing only:

1. **Outbox recovery:** define descendant-command behavior after a rejected/conflicted/superseded predecessor. Show server revision 3 with A expecting 3 and B expecting 4; A fails or is replaced. Preserve all latest local edits, immutable old operation IDs, account ownership, and restart safety. Define paused/superseded/replacement states, how a valid expected revision is obtained, and tests for rejection, conflict resolution, profile prerequisite failure, and edits made during resolution.
2. **Credential recovery:** define initial Apple exchange and refresh behavior across upstream success/API failure, committed session/lost response, and received credentials/failed or interrupted SecureStore writes. Include concurrent exchanges, challenge consumption, stale refresh replay, expired recovery windows, orphan sessions, and preserved offline records. Choose and justify the smallest safe mechanism; an explicit fresh-sign-in fallback is acceptable where it is truthful and preserves data. Do not imply a transaction can atomically span Apple, PostgreSQL, and device storage.
3. **Transaction guardrail:** specify a consistent lock/claim order for auth revocation, operation IDs, and aggregates, including the same account-wide operation ID racing across different session aggregates. Define the expected public error and no-partial-commit evidence. Do not hold database locks across provider HTTP requests.

Acceptance: concise state transitions and representative errors, crash/race tests for each path, no automatic data loss, no identity bypass, and any remaining genuinely necessary owner authorization clearly separated from implementation choices. Cross-reference the existing contracts rather than rewriting the entire proposal.

Return the addendum in the task and stop. No file edits, installs, code, migrations, provider/account configuration, private data access, hosted changes, Git changes, or other task dispatch.
