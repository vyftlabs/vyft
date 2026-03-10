## 0.2.0-alpha (2026-03-10)

### 🚀 Features

- **vyft:** pin vyft version from npm registry during init ([e124913](https://github.com/vyftlabs/vyft/commit/e124913))
- **vyft:** native dev execution with auto-detection and file watching ([#49](https://github.com/vyftlabs/vyft/issues/49))
- **vyft:** implement local up / down / reset commands ([8de0340](https://github.com/vyftlabs/vyft/commit/8de0340))
- **vyft:** add passphrase persistence with explicit save prompt for deploy ([#47](https://github.com/vyftlabs/vyft/issues/47))
- **marketing:** redesign landing page with grid-line aesthetic ([f2337c7](https://github.com/vyftlabs/vyft/commit/f2337c7))
- **marketing:** redesign landing page with grid-line aesthetic ([b926521](https://github.com/vyftlabs/vyft/commit/b926521))
- **platform:** add bucket, queue resources and vyft/services entrypoint ([e751ad9](https://github.com/vyftlabs/vyft/commit/e751ad9))
- **vyft:** improve context commands with interactive prompts and better output ([bbc3070](https://github.com/vyftlabs/vyft/commit/bbc3070))
- **vyft:** make context name optional with interactive prompt ([219dc96](https://github.com/vyftlabs/vyft/commit/219dc96))
- **vyft:** rename local platform to remote with SSH/k8s connection prompts ([5a52419](https://github.com/vyftlabs/vyft/commit/5a52419))
- **vyft:** interactive platform and runtime prompts in context add ([3c30d90](https://github.com/vyftlabs/vyft/commit/3c30d90))
- dynamic provider resolution with Docker fallback resources ([7a9947c](https://github.com/vyftlabs/vyft/commit/7a9947c))
- **vyft:** add tsconfig and typescript to bun template ([c86b486](https://github.com/vyftlabs/vyft/commit/c86b486))
- **vyft:** overhaul init command with templates and clack prompts ([4b944a2](https://github.com/vyftlabs/vyft/commit/4b944a2))
- scaffold Astro marketing site with Tailwind ([41dcc5d](https://github.com/vyftlabs/vyft/commit/41dcc5d))
- add @vyft/errors and @vyft/store packages ([1a145b5](https://github.com/vyftlabs/vyft/commit/1a145b5))

### 🩹 Fixes

- **ci:** switch to local nx release with CI-only publish ([3dfb72f](https://github.com/vyftlabs/vyft/commit/3dfb72f))
- **ci:** disable nx git commit and tag (managed via workflow tags) ([0af5c35](https://github.com/vyftlabs/vyft/commit/0af5c35))
- **ci:** set git identity for release workflow ([af8939f](https://github.com/vyftlabs/vyft/commit/af8939f))
- **ci:** add automaticFromRef for first release changelog ([4aef493](https://github.com/vyftlabs/vyft/commit/4aef493))
- **ci:** add fallbackCurrentVersionResolver for first release ([db92085](https://github.com/vyftlabs/vyft/commit/db92085))
- **ci:** move git config to release.git in nx.json ([459751d](https://github.com/vyftlabs/vyft/commit/459751d))
- **vyft:** fix biome formatting in detect.ts and dev.ts ([23c598a](https://github.com/vyftlabs/vyft/commit/23c598a))
- **vyft:** fix biome formatting in up.ts ([77b2491](https://github.com/vyftlabs/vyft/commit/77b2491))
- **vyft:** fix biome formatting in runtime.ts and runtime.test.ts ([b7bf550](https://github.com/vyftlabs/vyft/commit/b7bf550))
- **vyft:** address code review issues in passphrase persistence ([ba87c78](https://github.com/vyftlabs/vyft/commit/ba87c78))
- **vyft:** add missing reconcile() call to local dev ([e83c44a](https://github.com/vyftlabs/vyft/commit/e83c44a))
- **core:** reconcile pending store entries before planning ([#23](https://github.com/vyftlabs/vyft/issues/23))
- **vyft:** validate runtime selection against registered providers ([02046cb](https://github.com/vyftlabs/vyft/commit/02046cb))
- **vyft:** show error message in deploy failure spinner ([ea83c20](https://github.com/vyftlabs/vyft/commit/ea83c20))
- **store:** fix delete race, WAL schema, and round-trip data integrity ([e204623](https://github.com/vyftlabs/vyft/commit/e204623))
- **ci:** pin claude-code-action to commit SHA instead of tag object ([1b8a37b](https://github.com/vyftlabs/vyft/commit/1b8a37b))
- **vyft:** add test to builtin providers for e2e compatibility ([8b271bb](https://github.com/vyftlabs/vyft/commit/8b271bb))
- **vyft:** use non-null assertion for length-checked array access ([a53edf2](https://github.com/vyftlabs/vyft/commit/a53edf2))
- **vyft:** fix build errors in context/add and runtime imports ([66569cd](https://github.com/vyftlabs/vyft/commit/66569cd))
- **vyft:** resolve CLI version dynamically from package.json ([2962d25](https://github.com/vyftlabs/vyft/commit/2962d25))
- **vyft:** restore bun template package.json and exclude templates from workspace ([97986ae](https://github.com/vyftlabs/vyft/commit/97986ae))

### ❤️ Thank You

- bytekai
- Claude Opus 4.6
- Kai @bytekai

## 0.3.2 (2026-03-07)

This was a version bump only for vyft to align it with other projects, there were no code changes.

## 0.3.1 (2026-03-07)

### 🩹 Fixes

- **vyft:** resolve CLI version dynamically from package.json ([2962d25](https://github.com/vyftlabs/vyft/commit/2962d25))

### ❤️ Thank You

- bytekai

## 0.3.0 (2026-03-07)

### 🚀 Features

- **vyft:** add tsconfig and typescript to bun template ([c86b486](https://github.com/vyftlabs/vyft/commit/c86b486))

### ❤️ Thank You

- bytekai

## 0.2.2 (2026-03-07)

This was a version bump only for vyft to align it with other projects, there were no code changes.

## 0.2.1 (2026-03-07)

### 🩹 Fixes

- **vyft:** restore bun template package.json and exclude templates from workspace ([97986ae](https://github.com/vyftlabs/vyft/commit/97986ae))

### ❤️ Thank You

- bytekai

## 0.2.0 (2026-03-07)

### 🚀 Features

- **vyft:** overhaul init command with templates and clack prompts ([4b944a2](https://github.com/vyftlabs/vyft/commit/4b944a2))

### ❤️ Thank You

- bytekai

## 0.1.0 (2026-03-07)

### 🚀 Features

- scaffold Astro marketing site with Tailwind ([41dcc5d](https://github.com/vyftlabs/vyft/commit/41dcc5d))
- add @vyft/errors and @vyft/store packages ([1a145b5](https://github.com/vyftlabs/vyft/commit/1a145b5))

### ❤️ Thank You

- bytekai
- Claude Opus 4.6