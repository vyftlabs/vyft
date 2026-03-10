## 0.2.0-alpha (2026-03-10)

### 🚀 Features

- add @vyft/errors and @vyft/store packages ([1a145b5](https://github.com/vyftlabs/vyft/commit/1a145b5))
- add core functionality with apply, destroy, diff, and plan functions ([9749d19](https://github.com/vyftlabs/vyft/commit/9749d19))
- scaffold Astro marketing site with Tailwind ([41dcc5d](https://github.com/vyftlabs/vyft/commit/41dcc5d))
- dynamic provider resolution with Docker fallback resources ([7a9947c](https://github.com/vyftlabs/vyft/commit/7a9947c))
- **marketing:** build landing page with design language foundation ([#17](https://github.com/vyftlabs/vyft/issues/17))
- **marketing:** improve landing page with logo, code example, and features section ([0c690c5](https://github.com/vyftlabs/vyft/commit/0c690c5))
- **marketing:** redesign landing page with grid-line aesthetic ([b926521](https://github.com/vyftlabs/vyft/commit/b926521))
- **marketing:** redesign landing page with grid-line aesthetic ([f2337c7](https://github.com/vyftlabs/vyft/commit/f2337c7))
- **platform:** add bucket, queue resources and vyft/services entrypoint ([e751ad9](https://github.com/vyftlabs/vyft/commit/e751ad9))
- **std:** remove ssh resource ([6770506](https://github.com/vyftlabs/vyft/commit/6770506))
- **vyft:** overhaul init command with templates and clack prompts ([4b944a2](https://github.com/vyftlabs/vyft/commit/4b944a2))
- **vyft:** add tsconfig and typescript to bun template ([c86b486](https://github.com/vyftlabs/vyft/commit/c86b486))
- **vyft:** interactive platform and runtime prompts in context add ([3c30d90](https://github.com/vyftlabs/vyft/commit/3c30d90))
- **vyft:** rename local platform to remote with SSH/k8s connection prompts ([5a52419](https://github.com/vyftlabs/vyft/commit/5a52419))
- **vyft:** make context name optional with interactive prompt ([219dc96](https://github.com/vyftlabs/vyft/commit/219dc96))
- **vyft:** improve context commands with interactive prompts and better output ([bbc3070](https://github.com/vyftlabs/vyft/commit/bbc3070))
- **vyft:** add passphrase persistence with explicit save prompt for deploy ([#47](https://github.com/vyftlabs/vyft/issues/47))
- **vyft:** implement local up / down / reset commands ([8de0340](https://github.com/vyftlabs/vyft/commit/8de0340))
- **vyft:** native dev execution with auto-detection and file watching ([#49](https://github.com/vyftlabs/vyft/issues/49))
- **vyft:** pin vyft version from npm registry during init ([e124913](https://github.com/vyftlabs/vyft/commit/e124913))

### 🩹 Fixes

- release lock on Store.open failure, organize tests by concern ([34a5d0a](https://github.com/vyftlabs/vyft/commit/34a5d0a))
- CI build and test failures in @vyft/store ([da22ad9](https://github.com/vyftlabs/vyft/commit/da22ad9))
- **ci:** pin claude-code-action to commit SHA instead of tag object ([1b8a37b](https://github.com/vyftlabs/vyft/commit/1b8a37b))
- **ci:** move git config to release.git in nx.json ([459751d](https://github.com/vyftlabs/vyft/commit/459751d))
- **ci:** add fallbackCurrentVersionResolver for first release ([db92085](https://github.com/vyftlabs/vyft/commit/db92085))
- **ci:** add automaticFromRef for first release changelog ([4aef493](https://github.com/vyftlabs/vyft/commit/4aef493))
- **ci:** set git identity for release workflow ([af8939f](https://github.com/vyftlabs/vyft/commit/af8939f))
- **ci:** disable nx git commit and tag (managed via workflow tags) ([0af5c35](https://github.com/vyftlabs/vyft/commit/0af5c35))
- **ci:** switch to local nx release with CI-only publish ([3dfb72f](https://github.com/vyftlabs/vyft/commit/3dfb72f))
- **core:** make resource config optional ([280145e](https://github.com/vyftlabs/vyft/commit/280145e))
- **core:** reconcile pending store entries before planning ([#23](https://github.com/vyftlabs/vyft/issues/23))
- **core:** fix biome import order and formatting in reconcile.test.ts ([0c132a9](https://github.com/vyftlabs/vyft/commit/0c132a9))
- **core:** preserve store entry fields during refresh ([ea7940d](https://github.com/vyftlabs/vyft/commit/ea7940d))
- **docker:** remove response body from container creation errors ([70d9364](https://github.com/vyftlabs/vyft/commit/70d9364))
- **docker:** apply health check interval and timeout from config ([4a97678](https://github.com/vyftlabs/vyft/commit/4a97678))
- **docker:** handle mount options in bind path parsing ([#32](https://github.com/vyftlabs/vyft/issues/32))
- **docker:** address code review nitpicks in inspect ([a932880](https://github.com/vyftlabs/vyft/commit/a932880))
- **docker:** sort imports in inspect.test.ts for biome lint ([232e4aa](https://github.com/vyftlabs/vyft/commit/232e4aa))
- **e2e:** pass -y to context remove in sandbox cleanup ([d03bf4f](https://github.com/vyftlabs/vyft/commit/d03bf4f))
- **engine:** use Promise.allSettled to track partial step failures ([db8c709](https://github.com/vyftlabs/vyft/commit/db8c709))
- **engine:** unify dependency sorting across action types ([b4ddc88](https://github.com/vyftlabs/vyft/commit/b4ddc88))
- **engine:** fix lint and build issues in plan ([2ca87ec](https://github.com/vyftlabs/vyft/commit/2ca87ec))
- **runtime:** add default path fallback to cronjob constructor ([d791ff4](https://github.com/vyftlabs/vyft/commit/d791ff4))
- **std:** default SSH to trust-on-first-use host verification ([de75b7d](https://github.com/vyftlabs/vyft/commit/de75b7d))
- **store:** fix lock races, WAL data loss, concurrent appends, and undefined handling ([02d984e](https://github.com/vyftlabs/vyft/commit/02d984e))
- **store:** fix delete race, WAL schema, and round-trip data integrity ([e204623](https://github.com/vyftlabs/vyft/commit/e204623))
- **store:** defensive copies, WAL corruption detection, error handling ([5cd9e62](https://github.com/vyftlabs/vyft/commit/5cd9e62))
- **store:** add fsync to LocalBackend write and append ([#21](https://github.com/vyftlabs/vyft/issues/21))
- **vyft:** restore bun template package.json and exclude templates from workspace ([97986ae](https://github.com/vyftlabs/vyft/commit/97986ae))
- **vyft:** resolve CLI version dynamically from package.json ([2962d25](https://github.com/vyftlabs/vyft/commit/2962d25))
- **vyft:** fix build errors in context/add and runtime imports ([66569cd](https://github.com/vyftlabs/vyft/commit/66569cd))
- **vyft:** use non-null assertion for length-checked array access ([a53edf2](https://github.com/vyftlabs/vyft/commit/a53edf2))
- **vyft:** add test to builtin providers for e2e compatibility ([8b271bb](https://github.com/vyftlabs/vyft/commit/8b271bb))
- **vyft:** show error message in deploy failure spinner ([ea83c20](https://github.com/vyftlabs/vyft/commit/ea83c20))
- **vyft:** validate runtime selection against registered providers ([02046cb](https://github.com/vyftlabs/vyft/commit/02046cb))
- **vyft:** add missing reconcile() call to local dev ([e83c44a](https://github.com/vyftlabs/vyft/commit/e83c44a))
- **vyft:** address code review issues in passphrase persistence ([ba87c78](https://github.com/vyftlabs/vyft/commit/ba87c78))
- **vyft:** fix biome formatting in runtime.ts and runtime.test.ts ([b7bf550](https://github.com/vyftlabs/vyft/commit/b7bf550))
- **vyft:** fix biome formatting in up.ts ([77b2491](https://github.com/vyftlabs/vyft/commit/77b2491))
- **vyft:** fix biome formatting in detect.ts and dev.ts ([23c598a](https://github.com/vyftlabs/vyft/commit/23c598a))

### ❤️ Thank You

- bytekai
- Claude Opus 4.6
- Kai @bytekai

## 0.3.2 (2026-03-07)

This was a version bump only, there were no code changes.

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

### 🩹 Fixes

- **core:** make resource config optional ([280145e](https://github.com/vyftlabs/vyft/commit/280145e))

### ❤️ Thank You

- bytekai

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

- add @vyft/errors and @vyft/store packages ([1a145b5](https://github.com/vyftlabs/vyft/commit/1a145b5))
- add core functionality with apply, destroy, diff, and plan functions ([9749d19](https://github.com/vyftlabs/vyft/commit/9749d19))
- scaffold Astro marketing site with Tailwind ([41dcc5d](https://github.com/vyftlabs/vyft/commit/41dcc5d))

### 🩹 Fixes

- release lock on Store.open failure, organize tests by concern ([34a5d0a](https://github.com/vyftlabs/vyft/commit/34a5d0a))
- CI build and test failures in @vyft/store ([da22ad9](https://github.com/vyftlabs/vyft/commit/da22ad9))

### ❤️ Thank You

- bytekai
- Claude Opus 4.6