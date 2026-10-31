# AIメシモリ（開発コードネーム: AIseki）
食事記録サービス。AIが記録し、人は眺めるだけ。仕様: ~/workspace/app-ideas/aiseki-spec.md / 計画: ~/workspace/app-ideas/aiseki-phase1-plan.md

## Local dev (Phase1 scaffold, 2026-10-31)
- Runtime: Node 24 (node:sqlite for local dev DB; production target Postgres on Fly.io — DB layer is isolated in apps/api/src/db.js)
- API: GraphQL Yoga on Node http (same process serves PWA static + /.well-known/aithlon.json placeholder)
- Run: `npm install && npm start`  -> http://localhost:8787/  (PWA), /graphql, /healthz

Local DB note: this VM has no Docker/Postgres, so local dev uses SQLite file data/aiseki.db.
Schema mirrors the Postgres design in the phase1 plan; migrating = replace db.js implementation.

## License
MIT License. See [LICENSE](LICENSE).
