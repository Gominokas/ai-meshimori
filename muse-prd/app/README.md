# AIメシモリ Muse版アプリ（受け手の Muse 向け構築手順）

## 目的

このフォルダは、AIメシモリ Muse 版の「プログラム」である。受け手の Muse は、設計書の文章からアプリを生成するのではなく、本フォルダのコードを自環境のアーティファクトの実装として設置し、挙動を検証してから運用に入る。

- 仕様の正: リポジトリの shared/docs/aiseki-spec.md
- Muse 版の設計の正: リポジトリの muse-prd/docs/aiseki-artifact-design.md
- 移植の設計（移植元 aiseki との対応・正規化の一覧）: リポジトリの muse-prd/docs/app-port-design.md

## 前提

- 受け手は Muse（アーティファクトを作成・運用できる環境）。
- フロント（画面）は本フォルダに含めない。画面の正は shared/mockup/aiseki-mockup.html（配布に含まれる共有部のテンプレート）で、本フォルダはサーバ（アクション）層を担う。
- 本フォルダのコードに、特定の個人の値（実データ・個人設定の既定値）は含まれていない。設定は全て未設定（null）から始まる。

## 構成

| ファイル | 役割 |
|---|---|
| server/validate.js | 検証と語彙（区分・スラッグ・status、検証関数、並び替え） |
| server/actions.js | アクション層の全11アクションと参照用メモリストア |
| test/actions.test.mjs | 実地確認リストの自動テスト |

## 手順

1. アーティファクトの保存層を用意する。actions.js のストア契約は { meals: Map 相当, days: Map 相当, settings: Object } である。自環境の DB に合わせたアダプタを作り、createActions(store) に渡す。まず参照用メモリストアで挙動を掴んでから、アダプタに差し替えてよい。
2. server/ の2ファイルを、アーティファクトのアクション実装として設置する。アクション名と引数・返り値の契約は設計書 §2 と actions.js の実装どおりとする（upsert_meal / upsert_day / delete_meal / delete_day / next_meal_external_id / get_day / get_month / get_settings / update_settings / import_records / export_records）。
3. 画面は shared/mockup/aiseki-mockup.html のテンプレートを使い、get_month / get_day の返り値を流し込む形にする。
4. 初期設定を行う。設定は全て null で始まるため、その家の利用者へのヒアリング（チュートリアル §2）で決めた値を update_settings で入れる。current_tz が未設定のままだと、tz 省略の登録がエラーになる。
5. 検証する（下記の完了条件）。

## 禁止事項

- 本フォルダのコードの挙動を、文章の解釈で置き換えない。仕様・設計とコードが食い違う場合は、勝手に決めず、食い違いとして持ち帰る（コードの側が移植の正である部分と、仕様が正である部分は app-port-design.md §3 に切り分けてある）。
- 特定の個人の値を、コード・設定・サンプルに書き込まない。テストや例示には架空の値を使う。
- 検証を省略して運用に入らない。

## 完了条件

1. test/actions.test.mjs と同等の項目を、構築したアーティファクトの実物で確認する（app-port-design.md §5 の実地確認リスト全10項）。
2. 初期状態で設定が全て未設定（null）であること、個人の値がどこにも無いことを目視で確認する。
3. 最初の1件の登録（チュートリアル §4）が、採番→登録→get_day の確認まで通ること。
