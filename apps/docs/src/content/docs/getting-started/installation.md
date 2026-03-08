---
title: Installation
description: Install Vyft and set up your first project.
---

## Install

```bash
npm install -g vyft
```

## Create a project

```bash
vyft init my-app
cd my-app
```

This scaffolds a project with a `vyft.config.ts` and installs dependencies.

## Set up a context

Vyft uses contexts to target different deployment environments.

```bash
vyft context add production
vyft context use production
```
