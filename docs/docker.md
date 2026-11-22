# Docker

```sh
BRAYER_MCP_BEARER=secret docker compose up --build
```

The compose service ([`docker-compose.yml`](../docker-compose.yml), built from
[`Dockerfile`](../Dockerfile)):

- stores SQLite and blobs on the `brayer-data` volume at `/data`
  (`BRAYER_DB`, `BRAYER_BLOBS`);
- exposes HTTP MCP on `39293` and the event stream on `39294`;
- healthchecks `GET /health` every 30 s;
- serves stdio-style env semantics with a construction-side harness
  (`BRAYER_HARNESS`, default `openclaw`) — for shared multi-harness hosting use
  the HTTP transport with `X-Brayer-Harness` headers and pass the bearer to
  clients, as in the [main README](../README.md#harnesses).

Point a harness at `http://<host>:39293/mcp` with
`Authorization: Bearer <BRAYER_MCP_BEARER>`.
