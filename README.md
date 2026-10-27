# brayer

Brayer is a vendor-neutral command layer for agent work. It records a work order,
the attempts made against it, the handoff checkpoint, the evidence returned, and
the verdict — so a fleet of coding agents can be supervised by exception instead
of by transcript.

The product thesis and delivery plan are in [docs/roadmap.md](docs/roadmap.md).

## Status

Early scaffold. The CLI currently exposes `--version` and `--help`; the MCP
contract, store and adapters land in the stories listed in the roadmap.

## Requirements

- Node 22+
- A writable SQLite path (defaults to `~/.brayer/store.sqlite` in later stories)

## Development

```sh
npm install
npm test
node bin/brayer.js --help
```

## License

MIT
