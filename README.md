# FitQuest

An iOS-first adaptive athletic coach, built with React Native and Expo for a future shared Android frontend.

## Current state

This repository contains the **clean rebuild**, not the earlier prototype. It is an early local-development baseline, not a released AI coach.

Implemented under `rebuild/`:

- Required minimal athlete profile and multiple unplanned sessions per day.
- Strength and manual-duration logging, corrections, versioned drafts, and durable pending commands.
- Native SQLCipher storage with separate account-scoped SecureStore keys.
- Developer-only, explicitly enabled synthetic identities; Release remains locked.
- Shared TypeScript/Zod contracts and a Fastify health-only API scaffold.

**Not implemented:** real sign-in, backend athlete synchronization, AI coaching, nutrition workflows, Apple Health, or deployment. M1a is accepted for local development with synthetic data; verification limits and the uncommitted working-tree state are recorded in the [HQ review](docs/reviews/M1A_REVIEW.md). See [current handoff](docs/HANDOFF.md) and [Engineering evidence](rebuild/docs/M1A_REPORT.md).

## Development

The active npm workspace is `rebuild/`, not the repository root:

```sh
cd rebuild
npm ci
npm run check
```

Use [rebuild setup and iOS instructions](rebuild/README.md) for requirements, native builds, synthetic test boundaries, and recovery checks. Never enter real health data into the current development fixture.

## Product direction

Athletes should express specific or abstract goals in their own words and receive adaptive training across strength, cardio, sport, mobility, coordination, and recovery, including multiple daily sessions. Recommendations must use recorded history, nutrition, and subjective recovery without confusing planned activity with completed work.

The current logging slice establishes reliable records for that later coaching loop; it does not define the final coach experience. There is one product with private accounts, not separate personal and demo apps.

## Project source of truth

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Project context](docs/PROJECT_CONTEXT.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Current handoff](docs/HANDOFF.md)

HQ coordinates scope and acceptance; Architecture, Engineering, and Design work from bounded assignments. Use one writer per working tree or isolated worktrees with explicit integration ownership.

## Repository boundaries

The baseline includes the rebuild, curated project documentation, and synthetic evidence. Secrets, local databases, generated native/build output, private artifacts, and the earlier prototype are excluded.

On the original development machine, prototype files are retained locally and ignored; their original README is preserved as `README.prototype.md`. Fresh clones intentionally do not contain those files. Prototype retirement, public repository visibility, hosted service changes, and deployment require separate approval.
