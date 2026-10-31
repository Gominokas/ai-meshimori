# AIメシモリ（開発コードネーム: AIseki）
食事記録サービス。AIが記録し、人は眺めるだけ。

## これは何？
あなたの Muse が、あなたの食事と体重を記録してくれるアプリです。
- あなたがやるのは2つだけ: (1) 食事の写真や情報を送る (2) 「画面見せて」と言う
- 記録の構造化、データベースへの保存、修正、画面の表示は、全部 Muse の仕事
- データはあなたの環境のローカルにだけ残ります（ホスト型サービスではありません）

## あなたの Muse へ
このリポジトリを clone して、`docs/local-setup-for-agents.md` の手順でセットアップしてください。セットアップが終わったら、その手順書の「完了後にやること」（使い方の案内と画面ボタンの提示）まで行ってください。設定値（1日の標準 kcal など）は、利用者についてあなたが知っていることから決めてください。

仕様: ~/workspace/app-ideas/aiseki-spec.md / 計画: ~/workspace/app-ideas/aiseki-phase1-plan.md

## Local dev (Phase1 scaffold, 2026-10-31)
- Runtime: Node 24 (node:sqlite for local dev DB; production target Postgres on Fly.io — DB layer is isolated in apps/api/src/db.js)
- API: GraphQL Yoga on Node http (same process serves PWA static)
- Run: `npm install && npm start`  -> http://localhost:8787/  (PWA), /graphql, /healthz

Local DB note: this VM has no Docker/Postgres, so local dev uses SQLite file data/aiseki.db.
Schema mirrors the Postgres design in the phase1 plan; migrating = replace db.js implementation.

## License
MIT License. See [LICENSE](LICENSE).
