# Contributing to Vyft

Thank you for your interest in contributing to Vyft! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

   ```bash
   git clone https://github.com/your-username/vyft.git
   cd vyft
   ```

3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/vyftlabs/vyft.git
   ```

## Development Setup

### Install Dependencies

```bash
pnpm install
```

### Build the Project

```bash
pnpm build
```

### Run Development Mode

```bash
# Run all packages in development mode
pnpm dev

# Run specific package
pnpm --filter vyft dev
pnpm --filter @vyft/landing dev
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests for specific package
pnpm --filter vyft test
```

### Linting and Formatting

```bash
# Check code style
pnpm lint

# Format code
pnpm format

# Type checking
pnpm typecheck
```

## Making Changes

### Branch Naming

Create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
# or
git checkout -b docs/update-readme
```

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

- `feat(vyft): add Kubernetes deployment support`
- `fix(landing): resolve terminal rendering issue`
- `docs: update contributing guidelines`

### Code Style

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Testing

- Write tests for new features
- Ensure all tests pass before submitting
- Aim for high test coverage
- Test both success and error cases

## Pull Request Process

### Before Submitting

1. **Sync with upstream**:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks**:

   ```bash
   pnpm build
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

3. **Update documentation** if needed

### Submitting a PR

1. Push your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a pull request on GitHub
3. Fill out the PR template completely
4. Link any related issues
5. Request review from maintainers

### PR Requirements

- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] Clear description of changes
- [ ] Breaking changes documented

### Review Process

- Maintainers will review within 7 days
- Address feedback promptly
- Keep PRs focused and reasonably sized
- Be responsive to review comments

## Issue Guidelines

### Bug Reports

Use the bug report template and include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots if applicable

### Feature Requests

Use the feature request template and include:

- Clear description of the feature
- Use case and motivation
- Proposed solution
- Alternatives considered
- Additional context

### Good First Issues

Look for issues labeled `good first issue` or `help wanted` for beginner-friendly contributions.

## Coding Standards

### TypeScript

- Use strict type checking
- Prefer interfaces over types for object shapes
- Use meaningful type names
- Avoid `any` type

### Error Handling

- Use proper error types
- Provide meaningful error messages
- Handle errors gracefully
- Log errors appropriately

### Performance

- Consider performance implications
- Use efficient algorithms and data structures
- Avoid unnecessary re-renders or computations
- Profile performance-critical code

## Testing

### Unit Tests

- Test individual functions and components
- Mock external dependencies
- Test edge cases and error conditions
- Use descriptive test names

### Integration Tests

- Test component interactions
- Test API integrations
- Test user workflows

### E2E Tests

- Test complete user journeys
- Test critical paths
- Test across different environments

## Documentation

### Code Documentation

- Document public APIs with JSDoc
- Explain complex algorithms
- Include usage examples
- Keep comments up to date

### User Documentation

- Update README files
- Add examples and tutorials
- Document breaking changes
- Keep installation instructions current

## Release Process

### Versioning

We use semantic versioning (SemVer):

- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

### Changelog

- Document all changes in CHANGELOG.md
- Group changes by type
- Include migration guides for breaking changes

## Getting Help

- Check existing issues and discussions
- Join our community discussions
- Ask questions in GitHub discussions
- Contact maintainers directly for urgent issues

## Recognition

Contributors will be recognized in:

- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to Vyft! 🚀
