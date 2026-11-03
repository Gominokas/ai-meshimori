# Muse 版アプリ移植設計（Issue #23）

aiseki（ローカル版の実装）を Muse 版の形態へ移植し、アプリとしてまとめるための設計。仕様の正は shared/docs/aiseki-spec.md、Muse 版の設計の正は muse-prd/docs/aiseki-artifact-design.md、本書はその間の「移植の設計」である。

## 1. 目的

現行の Muse 版は、受け手の Muse が設計書（文章）から自環境のアーティファクトを生成する形態で、環境ごとに実装がブレる。本移植で、検証・登録・集計の実ロジックをプログラムとして同梱し、受け手は「文章からの生成」ではなく「同梱プログラムの設置」を行う形に改める。

## 2. 移植元と対応

移植元は aiseki の実コード（実際に稼働した実装）である。

| 移植元 | 内容 | 移植先 |
|---|---|---|
| packages/shared/validate.js | 検証（validateMeal / validateDay / assertSingleEmoji）、語彙（区分・スラッグ・status）、並び替え sortMeals | muse-prd/app/server/validate.js |
| apps/api/src/schema.js | upsert / delete / calendar / day / weightSeries / updateSettings のリゾルバ実装 | muse-prd/app/server/actions.js（アクション契約へ変換） |
| apps/api/src/db.js | テーブル定義（保存形式の参考） | 保存は受け手の環境に委ねるため移植しない。フィールドの正は設計書 §1 |

移植しないもの:

- apps/web（旧フロント）: 初期プロトタイプで、個人の値（開始月・目標値のフォールバック等）が混入しており、現行フロントとは別物。現行フロントの正は shared/mockup/aiseki-mockup.html で、そちらは組み立て済み配布に既に含まれる。本パッケージはサーバ（アクション）層を担い、フロントは共有部のテンプレートを使う。
- apps/api/src/server.js と認証（AIthlon）まわり: Muse 版の実行形態（アーティファクトのアクション）には存在しないため対象外。

## 3. 移植時の正規化ポイント

移植元（aiseki）と Muse 版の確定仕様・設計が食い違う箇所は、以下の一覧のとおり寄せる。ここに無い挙動は移植元のコードどおりとする。

| # | 箇所 | 移植元 | 移植先で採る形 | 根拠 |
|---|---|---|---|---|
| 1 | 時刻なし食事の区分順 | MEAL_ORDER が 夕食→おやつ の順 | 朝食→昼食→おやつ→夕食→夜食→その他 | 仕様書 §2 の明記が正 |
| 2 | upsert_day の意味論 | 全項目の置き換え（未送信項目は null で消える） | 部分保持（省略は既存値を保持、消すときは明示的 null） | Muse 版の Phase A で確定した運用（体重と運動が別タイミングで書かれるため） |
| 3 | days の運動項目 | 無し | steps / exercise_minutes / exercise_kcal を日次項目に追加 | Muse 版設計 §1（2026-11-01 追加分） |
| 4 | delete の不在時 | Boolean を返す（エラーにしない） | 存在しない external_id はエラー | Muse 版 Phase A の確定 |
| 5 | 設定の既定値 | テナント行に target_kcal=1860・世帯名などの実値が初期値として埋め込まれている | 既定値は持たない（全て null から開始し、その家の AI が初期設定で決める） | 配布物に個人の実値を入れない恒常ルール |
| 6 | tz 省略時の解決 | テナントの current_tz、無ければ 'Asia/Tokyo' にフォールバック | settings.current_tz で解決し、解決できなければエラー（地域の実値を焼き込まない） | 同上 |
| 7 | value_source の判定 | 書き込み時に items から判定して保存 | 設計書 §3 どおり、保存値はそのまま、読み取り（get_day 等）で items から自動判定して返す | Muse 版設計 §3 |
| 8 | セルのスタンプ | API は days.emoji のみ返し、優先順位はフロント側 | get_month が設計書 §4 の優先順位（days.emoji > 代表メニューの emoji > 🍽️）で解決して返す | Muse 版設計 §4 と現行アーティファクトの実装 |
| 9 | next_meal_external_id / import_records / export_records | aiseki に無い（Muse 版の追加アクション） | 設計書 §2 の契約どおり実装する（移植ではなく設計からの実装） | Muse 版設計 §2 |

## 4. パッケージ構成（muse-prd/app/）

| ファイル | 役割 |
|---|---|
| README.md | 受け手の Muse 向け構築手順（目的・前提・手順・確認・禁止事項・完了条件） |
| server/validate.js | 検証と語彙（移植元: packages/shared/validate.js） |
| server/actions.js | アクション層（全11アクション）。保存はストアインターフェース越しで、参照用のメモリストアを含む |
| test/actions.test.mjs | 実地確認リストの自動テスト（node で実行可能） |

## 5. 実地確認リスト（受け手が構築後に必ず実行する）

自動テスト（test/actions.test.mjs）が通ることに加え、構築したアーティファクトの実物で次を確認する。

1. 初期状態: 設定が全て未設定（null）で始まること。個人の値がどこにも入っていないこと。
2. 採番: next_meal_external_id が連番を返し、同日・同区分で連番が進むこと。
3. 登録と集計: actual を登録すると get_day の actual 合計とレンジ（±の合計）に反映され、planned は別枠になること。
4. skipped: kcal=0 で登録でき、合計に数えられないこと。kcal≠0 の skipped がエラーになること。
5. tz: 省略時に settings.current_tz で焼き込まれること。既存と食い違う tz の upsert がエラーになること。
6. 日次: upsert_day の部分送信で、送信していない項目（体重など）が消えないこと。明示的 null で消えること。
7. 削除: delete_meal / delete_day が物理削除され、存在しない ID の削除がエラーになること。
8. 月表示: get_month の代表メニューが最大 kcal の actual（無ければ最初の planned）になり、スタンプ優先順位が設計どおりであること。予定のみの日が planned_only として返ること。
9. 移行: import_records → export_records の往復で件数と日別合計が一致すること。
10. 設定: update_settings は渡した項目だけが変わること。

## 6. 範囲外

- prd 部との統合（版の分離は維持）。
- 稼働中の 1 号機アーティファクトの置き換え（別途判断）。
