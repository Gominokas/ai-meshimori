> 出典: 本書は `~/workspace/app-ideas/aiseki-artifact-design.md` として作成された設計書を、2026-11-01 に本リポジトリへ移載したもの。以後はこの git 版（`muse-prd/aiseki-artifact-design.md`）を正とする。移載元のファイルは当面残す。

# AIメシモリ アーティファクト版 ロジック設計

（2026-10-31 起案。リポジトリ版＝仕様・デザインの正、アーティファクト版＝各家庭の実行形態、という位置づけのうえでの設計）

## 0. 原則

- 保存は生レコードだけ。派生（合計・代表メニュー・スタンプ・ゲージ）は描画時に計算する（薄いロジック）。バージョンアップの大半を表示層の差し替えで済ませるため。
- 見た目はリポジトリ版テンプレート（shared/mockup/aiseki-mockup.html）そのまま。
- 記録の同一性は external_id で担保する（リポジトリ版と同一規約）。

## 1. データモデル

- meals: external_id（一意）, date, tz, eaten_time, std_date, std_time, meal_type, menu, kcal, kcal_pm, status（planned/actual/skipped）, tags[], place, emoji, report_source, value_source, items[{name, kcal, kcal_pm, value_source}]
- days: external_id（一意）, date, tz, weight_kg, body_fat_pct, bmi, emoji, steps, exercise_minutes, exercise_kcal（運動データはいずれも任意・2026-11-01 追加）
- settings: target_kcal, current_tz, week_start, spec_version（対応する prd の版）

## 2. アクション（エージェント用操作）

- upsert_meal(input): バリデーション後に external_id で upsert。同じ external_id があればレコード全体を置き換える（部分更新はしない。履歴や版数も積まない＝今のリポジトリ版と同じ上書き方式）。
- upsert_day(input): 同上。
- update_settings(input): target_kcal / current_tz / week_start。
- get_month(month) / get_day(date): エージェント側の確認・提示用（画面はアプリが自DBから直接描く）。
- import_records({meals, days, settings}): 移行用。external_id upsert で一括投入し、投入件数と日別合計を返す（突合用）。
- export_records(): 全レコード＋設定を JSON で返す（バックアップ・移行用）。
- delete_meal(external_id) / delete_day(external_id): 物理削除。存在しない場合はエラー。削除した external_id を返す（2026-11-01 追加。予定の中止・誤登録を skipped の墓標でなく完全削除するため）。
- next_meal_external_id(date, category): その日・その区分の既存 external_id から、次の連番（2桁ゼロ埋め）を付けた external_id を返す。送信側は登録前にこれで採番する（2026-11-01 追加）。

## 3. バリデーション（現行仕様どおり）

- external_id と report_source は必須。
- eaten_time は HH:MM 形式（24:41 のような経過表記可）。無い場合は null（--:-- で保存しない）。
- skipped は kcal=0、menu 不要。
- 既存 external_id と tz が食い違う upsert はエラー。
- emoji は書記素クラスタ1つまで。
- value_source は items がある場合は描画時に自動判定（混在 / 公式値 / 推定）、無い場合は保存値を使う。

## 4. 描画時の派生（テンプレート側ロジック）

- 日合計は actual のみ合算。planned は planned_kcal / planned_count として別枠で持つ。
- 代表メニュー: 最大 kcal の actual、無ければ並び順で最初の planned。
- セルのスタンプ優先順位: days.emoji > 代表メニューの meals.emoji > 予定のみの日は planned の絵文字 > 🍽️。
- セルの色: 合計 ÷ 標準（target_kcal）の比で決定（現行テンプレートのルールどおり）。予定のみの日は破線枠＋絵文字を薄く。
- ゲージ: 合計と target_kcal。残りラベルは残りマージンが scale の15%未満の日は非表示（現行修正の反映）。
- 体重グラフ: days.weight_kg の時系列。

## 5. 移行手順（リポジトリ版 → アーティファクト版）

1. リポジトリ版 DB から meals / days / settings を読み出す。
2. import_records で一括投入する。
3. 突合: 日別の actual 合計と体重の件数を移行前後で比較し、ズレゼロを確認する。
4. 以後の書き込み先をアーティファクトに切り替える（送信側エージェントへ連携）。
5. リポジトリ版 DB は保険として残す（削除しない）。

## 6. バージョンアップ手順

- settings.spec_version と prd の版を比べ、差分があれば更新する。
- 表示層のみの変更 → テンプレート差し替え（データ無傷）。
- データモデルの変更 → 版ごとの移行ステップをキットに追記し、順に適用する。

## 7. 描画しやすい持ち方とデータ量の抑制

- 描画しやすさ: 画面は月単位で完結させる。読み取りは「その月の meals と days だけ」を date 範囲で一括取得し、派生はサーバ層で計算して月ビューとして返す。画面は月ビューを受け取って描くだけ。全期間を毎回読まない。
- データ量の抑制:
  1. 上書きは置き換えのみ（履歴を積まない）ので、訂正では増えない。
  2. 派生値は保存しない（合計・代表・スタンプは都度計算）ので、二重持ちで増えない。
  3. items は必要なときだけ、最小項目で持つ。
  4. 実測感: 417日分（1,273食）で JSON 約295KB（リポジトリ版の重いテスト実績）。年1,100食ペースでも DB としては軽い部類。
  5. （未決）長期の圧縮案: 古い月を日次サマリに凍結して食事の詳細を落とす。容量は減るが詳細を失う。やるかどうか・何ヶ月からかはダーリンの判断。

## 8. 未決・要実地確認

- （解消 2026-10-31）別チャットからのアクション呼び出しは可能（ダイエット窓が get_settings で実証）。
- エクスポート形式は JSON で十分か（当面は十分な想定）。
