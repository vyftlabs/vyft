# @vyft/landing

Interactive demo and documentation website for Vyft.

## Overview

This is the landing page and interactive demo for Vyft, built with Astro and deployed on Cloudflare Pages.

## Features

- Interactive terminal demo
- Live code examples
- Responsive design
- Fast static site generation

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment

The site is automatically deployed to Cloudflare Pages when changes are pushed to the main branch.

### Manual Deployment

```bash
# Build and deploy to Cloudflare Pages
pnpm deploy

# Deploy to specific project
pnpm pages:deploy

# Local development with Cloudflare Pages
pnpm pages:dev
```

## Configuration

- `astro.config.mjs` - Astro configuration
- `tailwind.config.mjs` - Tailwind CSS configuration
- `wrangler.toml` - Cloudflare Pages configuration

## Project Structure

```
src/
├── components/     # Astro components
├── commands/       # Terminal command implementations
├── layouts/        # Page layouts
├── pages/          # Static pages
└── styles/         # Global styles
```

## License

AGPL v3 - Commercial use allowed, commercialization prevented.
