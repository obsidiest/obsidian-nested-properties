# Contributing

Contributions are welcome! Here's how to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) (latest LTS recommended)
- npm (comes with Node.js)

## Setup

```bash
git clone https://github.com/mnaoumov/obsidian-nested-properties.git
cd obsidian-nested-properties
npm install
```

## Development Workflow

### Build

```bash
npm run build
```

The canonical production bundle is written to `dist/build/`. The build also
mirrors its fresh `main.js` and `styles.css` to the repository root for local
deployment tools that expect the standard flat Obsidian plugin layout.

### Dev Mode

```bash
npm run dev
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Format

```bash
npm run format:check
npm run format
```

### Spellcheck

```bash
npm run spellcheck
```

### Test

```bash
npm run test
npm run test:coverage
```

## Pull Requests

- Base your PR on the `master` branch.
- Ensure all checks pass (`lint`, `format:check`, `spellcheck`, `test`).
