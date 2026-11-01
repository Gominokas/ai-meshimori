# AIメシモリ（開発コードネーム: AIseki）
食事記録サービス。AIが記録し、人は眺めるだけ。

## これは何？
あなたの Muse が、あなたの食事と体重を記録してくれるアプリです。
- あなたがやるのは2つだけ: (1) 食事の写真や情報を送る (2) 「画面見せて」と言う
- 記録の構造化、データベースへの保存、修正、画面の表示は、全部 Muse の仕事
- データはあなたの環境のローカルにだけ残ります（ホスト型サービスではありません）

## リポジトリ構成（3部構成）

main は開発統合用で、次の3部をすべて持ちます。

- `shared/` — 共有部: 仕様（aiseki-spec.md）、計画・決定ログ（aiseki-phase1-plan.md）、画面テンプレート（mockup/）、バリデーション（validate.js）
- `prd/` — prd 部（Muse 以外向け）: ローカル版の実装（apps/）とセットアップ手順書（local-setup-for-agents.md）
- `muse-prd/` — muse-prd 部（Muse 向け）: アーティファクト版の設計（aiseki-artifact-design.md）と接続キット（connect-kit-for-agents.md）

配布は組み立てで行います: **共有部＋prd部 → prd ブランチ**、**共有部＋muse-prd部 → muse-prd ブランチ**。中身はほぼ同じで、出力方法などが版ごとに異なります。

### ドキュメント一覧

文書は各部に分かれて置かれます（配布の組み立てで、その版に必要な文書が一緒に付いて行くため）。全体の地図はこの表が正です。

| 文書 | 場所 | 役割 |
|---|---|---|
| 仕様書（aiseki-spec.md） | `shared/` | 正の仕様 |
| 計画・決定ログ（aiseki-phase1-plan.md） | `shared/` | 決定の履歴 |
| 画面テンプレート（aiseki-mockup.html） | `shared/mockup/` | 表示の土台（単一HTML） |
| ローカルセットアップ手順（local-setup-for-agents.md） | `prd/` | ローカル版の導入手順 |
| アーティファクト版の設計（aiseki-artifact-design.md） | `muse-prd/` | Muse 版のロジック設計 |
| 接続キット（connect-kit-for-agents.md） | `muse-prd/` | エージェント向けの接続・運用キット |

## あなたの Muse へ
使う版に合わせてブランチを選んで clone してください（ローカル版は **prd**、Muse アーティファクト版は **muse-prd**。例: `git clone -b prd https://github.com/Gominokas/ai-meshimori.git`）。main ブランチは開発用です。
- ローカル版のセットアップ: `prd/local-setup-for-agents.md` の手順（作業は `prd/` フォルダの中）。終わったら手順書の「完了後にやること」（使い方の案内と画面ボタンの提示）まで行ってください。
- Muse 版の運用: `muse-prd/connect-kit-for-agents.md` と `muse-prd/aiseki-artifact-design.md` を参照。
- 設定値（1日の標準 kcal など）は、利用者についてあなたが知っていることから決めてください。

仕様: `shared/aiseki-spec.md` / 計画: `shared/aiseki-phase1-plan.md`

## Local dev (Phase1 scaffold, 2026-10-31)
- Runtime: Node 24 (node:sqlite for local dev DB; production target Postgres on Fly.io — DB layer is isolated in prd/apps/api/src/db.js)
- API: GraphQL Yoga on Node http (same process serves PWA static)
- Run: `cd prd && npm install && npm start`  -> http://localhost:8787/  (PWA), /graphql, /healthz

Local DB note: this VM has no Docker/Postgres, so local dev uses SQLite file data/aiseki.db (under prd/).
Schema mirrors the Postgres design in the phase1 plan; migrating = replace db.js implementation.

## License
MIT License. See [LICENSE](LICENSE).
