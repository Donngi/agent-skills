---
name: diagramming-domain-models
description: "DDD（ドメイン駆動設計）のドメインモデル図を生成・更新するスキル。エンティティ・バリューオブジェクト・集約（境界と集約ルート）・リポジトリ・ドメインサービス・ドメインイベントの関係を、JSON 中間ファイル → 機械検証 → 自己完結 HTML として決定論的に描画する。既存コードのドメイン層からの逆生成、対話でのゼロからのモデリング、既存 .model.json への集約追加・更新のすべてに対応。ユーザーがドメインモデル・集約・エンティティ・バリューオブジェクト・ユビキタス言語・境界づけられたコンテキストについて「図にして」「可視化して」「整理して」「一覧が見たい」「レビューしたい」「資料を作りたい」「全体像を把握したい」と求めたら、「ドメインモデル図」という言葉を使っていなくても必ずこのスキルを使うこと（例:「ドメインモデル図を作って」「DDD でモデリングして」「集約境界を見直したい」「どのクラスが集約ルートでどれが VO か図で見たい」「domain model diagram」「ドメイン層を図に起こして」「.model.json に集約を追加して」）。自分で Mermaid や独自 HTML を書いて済ませず、また対象コードの調査やファイル探索を始める前に、**他のツールより先にまず本スキルを起動すること**（どのコードを読んでよいかの制約を本スキルが定義するため。先に探索すると非ドメイン要素が図に混入する）。対象外: ER 図・DB スキーマ図、DDD 以外の一般的なクラス図、ユースケース図、シーケンス図、画面遷移図、インフラ構成図、DNS のドメイン設定。"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# diagramming-domain-models — ピュアなドメインモデル図の生成

DDD の戦術的設計をドメイン層に閉じた形で図にするスキル。中間 JSON（唯一の情報源）→ 機械検証 → 自己完結 HTML の3層構成。

```
入力（A: コード逆生成 / B: 対話モデリング）
   ▼  Claude が読解・分類・対話を担当
docs/domain-model/<context>.model.json    ← 唯一の情報源（Claude が Write/Edit）
   ▼  node lib/validate.mjs（スキーマ + 純度チェック。PASS まで修正ループ）
   ▼  node lib/render.mjs  （決定論的レンダラー。validate ERROR なら描画拒否）
docs/domain-model/<context>.html          ← 人間が見る自己完結 HTML
```

## 前提条件

- Node.js 18 以上（`node --version` で確認）。npm 依存はゼロ
- スキルのインストール先は可変。最初に Glob で `**/diagramming-domain-models/lib/render.mjs` を探して `${SKILL}`（スキルのルート）を確定すること

## 重要な原則

1. **JSON が唯一の情報源、HTML は生成物**。モデルの変更は必ず `.model.json` を編集して再レンダリングする。HTML を直接編集してよいのは `<!-- DOMAIN-MODEL:OVERVIEW:START/END -->` の間だけ（再レンダリングで自動引き継ぎされる）
2. **ドメイン層に閉じる**。ユースケース・アプリケーションサービス・コントローラ・DTO・プレゼンテーション・インフラは図に載せない。これはプロンプト上の注意ではなく機械的なゲートで、スキーマのホワイトリストと禁止語彙チェックが構造的に拒否する（[references/purity-rules.md](references/purity-rules.md)）
3. **決定論と AI の分担**。検証・レンダリングはスクリプトの仕事。Claude の仕事は読解・分類・対話・OVERVIEW の概説記入
4. **ユーザーへの質問は選択肢形式**。オープンクエスチョンではなく、意味のある選択肢2〜5個 + その他で聞く

## 動作上の禁止事項

- validate が PASS（exit 0、または合意済み WARN の exit 2）になる前に HTML をユーザーに提示しない
- OVERVIEW 枠の外側の HTML を手編集しない
- ユーザーの明示的な合意なしに `purityExceptions` へ追加しない
- コード逆生成モードで、確認済みドメイン層パス以外のコードを根拠にモデル要素を追加しない
- ワークフローにない中間ファイルを作らない

## ワークフロー

### 0. 共通セットアップ

1. Glob で `**/diagramming-domain-models/lib/render.mjs` を探し、`${SKILL}` を確定する
2. `node --version` で Node 18+ を確認する
3. 対象プロジェクトで Glob `docs/domain-model/*.model.json`（見つからなければ `**/*.model.json` も）を確認する
   - **既存モデルがある** → [C. 更新フロー](#c-更新フロー) へ
   - **ない** → モード選択を選択肢で質問する:
     > どの方法でドメインモデル図を作りますか？
     > (1) 既存コードのドメイン層から逆生成する
     > (2) 対話でゼロからモデリングする
     > (3) 設計ドキュメントから起こす（→ B の変種。ドキュメントを読んでから B の 3〜5 を実施）
4. 出力先を確認する（初回のみ）。デフォルトは `docs/domain-model/<context-slug>.model.json` と同名 `.html`

### A. コード逆生成モード

[references/reverse-engineering-guide.md](references/reverse-engineering-guide.md) を読んでから始める。

1. **ドメイン層の特定**: Glob（`**/domain/**`, `**/model/**`, `**/core/**` 等）で候補を列挙し、**選択肢でユーザーに確認**する。確定パスを `source.paths` に記録する
2. **読解スコープの制約**: Read/Grep は確定パス配下のみ。application / usecase / controller / presentation / handler / infrastructure / dto 配下は開かない。ドメイン層クラスの外部参照も追跡しない。これが「読んだものを書いてしまう」混入の入口を断つ
3. **分類と JSON 作成**: ガイドのヒューリスティクスに従って分類し、[references/model-schema.md](references/model-schema.md) のスキーマで `.model.json` を Write する。分類の判断根拠は各要素の `description` に一言残す
4. **検証ループ（完了ゲート）**:
   ```bash
   node "${SKILL}/lib/validate.mjs" docs/domain-model/<context>.model.json
   ```
   - exit 1（ERROR）→ 指摘を修正して再実行
   - exit 2（WARN）→ [references/purity-rules.md](references/purity-rules.md) の解消手順どおり、選択肢でユーザーと解消する（改名 / 移動 / 合意の上 purityExceptions 登録）
   - **exit 0、または合意済み例外を登録した上での再実行で exit 0 になるまで先へ進まない**
5. **レンダリングと概説**:
   ```bash
   node "${SKILL}/lib/render.mjs" docs/domain-model/<context>.model.json
   ```
   生成された HTML の OVERVIEW 枠（`<!-- DOMAIN-MODEL:OVERVIEW:START/END -->` の間）に、集約の責務分担と参照方向の設計意図を2〜6行で Edit 記入する。HTML のパスを提示し、ブラウザで開くよう案内する
6. **ユーザーレビュー**: 集約の一覧と境界の妥当性を選択肢で確認する。修正は JSON を Edit して 4 に戻る

### B. 対話モデリングモード

[references/interview-guide.md](references/interview-guide.md) の5段階（ドメイン概要 → 中心概念 → 集約境界 → VO/enum/不変条件 → 仕上げ）に沿って、各段階を選択肢で確認しながら JSON を**段階的に**構築する。1段階進むごとに validate を回す。以降は A-4〜6 と共通。

### C. 更新フロー

1. 既存の `.model.json` を Read する（**HTML から情報を吸い上げない**）
2. 変更要求を JSON への Edit として反映する（コード再読が必要なら A-1〜2 のスコープ制約に従う）
3. validate → render（A-4〜5 と同じ）。OVERVIEW は自動で引き継がれるが、変更でモデルの設計意図が変わった場合は概説も更新する

## 純度ゲートに関する応答

ユーザーが「Controller や DTO も図に載せて」「画面も含めて」と求めた場合:
- このスキルの目的（ドメイン層に閉じたピュアなドメインモデル図）と、スキーマ・検証が機械的に拒否することを説明する
- 代替案を提示する: 別の図（レイヤー構成図・画面遷移図等）を別ファイルとして作る、あるいは呼び出し関係は OVERVIEW の文章で言及する

## スクリプト一覧

| コマンド | 役割 |
|---|---|
| `node "${SKILL}/lib/validate.mjs" <model.json>` | スキーマ + 純度検証。exit 0=PASS / 1=ERROR（描画不可） / 2=WARN（要合意） |
| `node "${SKILL}/lib/render.mjs" <model.json> [--out <path>]` | 自己完結 HTML 生成。冒頭で validate を再実行し ERROR なら拒否 |

## 参照ファイル

- [references/model-schema.md](references/model-schema.md) — JSON スキーマ仕様（Write する前に必ず読む）
- [references/sample-model.json](references/sample-model.json) — 完全なサンプル
- [references/purity-rules.md](references/purity-rules.md) — 禁止語彙・WARN 解消手順（validate が WARN/ERROR を出したら読む）
- [references/reverse-engineering-guide.md](references/reverse-engineering-guide.md) — コード逆生成の手順（A モードで読む）
- [references/interview-guide.md](references/interview-guide.md) — 対話モデリングの質問フロー（B モードで読む）
