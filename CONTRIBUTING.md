# Contributing

Bug reports and focused pull requests are welcome. Use the issue templates for reproducible bugs
and feature requests; report security issues through GitHub's private vulnerability form instead.

## Development

Requires Node.js 22.20 or later and Yarn 4 via Corepack.

```sh
corepack enable
yarn install
yarn format:check
yarn lint
yarn test:coverage
yarn companion-module-check
yarn package
```

Keep changes scoped, update user documentation and `CHANGELOG.md` when behavior changes, and add
tests for new behavior or regressions. Do not hand-edit generated RPC files: regenerate the narrow
`ICompanionRpc` client in LeagueBroadcast, then re-vendor it here.

Pull requests must pass the repository checks. By contributing, you agree that your contribution
is licensed under this repository's MIT license.
