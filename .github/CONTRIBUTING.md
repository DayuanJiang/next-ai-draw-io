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

Pre-commit hooks via Husky will run Biome automatically on staged files.

For a better experience, install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) for real-time linting and format-on-save.

## Pull Requests

1. Create a feature branch
2. Make changes and ensure `npm run check` passes
3. Submit PR against `main` with a clear description

## Issues

Include steps to reproduce, expected vs actual behavior, and AI provider used.
