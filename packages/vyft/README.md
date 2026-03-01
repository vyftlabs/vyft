# vyft

CLI and SDK for deploying and managing infrastructure and services.

## Install

```sh
npm install -g vyft
```

## Usage

```sh
vyft deploy
vyft destroy
vyft status
vyft dev
```

## Services

Higher-level helpers available via `vyft/services`:

- `postgres(id, opts?)` — PostgreSQL database
- `redis(id, opts?)` — Redis key-value store
- `bucket(name)` — S3-compatible object storage (Garage)
- `queue(id, opts?)` — message queue
- `site(id, opts)` — static site served by nginx
