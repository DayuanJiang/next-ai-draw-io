# Contributing

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/next-ai-draw-io.git
cd next-ai-draw-io
npm install
cp env.example .env.local
npm run dev
```

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
npm run format   # Format code
npm run lint     # Check lint errors
npm run check    # Run all checks (CI)
```

Git hooks via Husky run automatically:
- **Pre-commit**: Biome (format/lint) + TypeScript type check
- **Pre-push**: Unit tests

For a better experience, install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) for real-time linting and format-on-save.

## Testing

Run tests before submitting PRs:

```bash
npm run test        # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
```

E2E tests use mocked API responses - no AI provider needed. Tests are in `tests/e2e/`.

To run a specific test file:
```bash
npx playwright test tests/e2e/diagram-generation.spec.ts
```

To run tests with UI mode:
```bash
npx playwright test --ui
```

## Before You Start

For **significant changes** (new features, architecture changes, large refactors, etc.), please **open an issue first** to discuss your proposal before writing code. This helps avoid wasted effort and ensures alignment with the project direction. Small bug fixes and minor improvements can go straight to a PR.

## Pull Requests

1. Create a feature branch
2. Make changes (pre-commit runs lint + type check automatically)
3. Run E2E tests with `npm run test:e2e`
4. Push (pre-push runs unit tests automatically)
5. Submit PR against `main` with a clear description

CI will run the full test suite on your PR.

## Code Review

This project uses GitHub Copilot for automated code review. If you receive review comments from Copilot on your PR:
- **Valid suggestions**: Please address them in your code.
- **Invalid or irrelevant suggestions**: Feel free to click "Resolve" to dismiss them.

## Issues

Include steps to reproduce, expected vs actual behavior, and AI provider used.
