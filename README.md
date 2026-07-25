# Agent Skills

AI Agentで利用可能なスキル集です。

本リポジトリに含まれるスキルは、特定のAI Agent（Claude Code、Kiro CLI等）に依存しない汎用的なフォーマットで記述されています。そのため、スキル機能をサポートする様々なAI Agentで利用可能です。

特定のAI Agentに最適化したい場合は、`skill-converter`スキルを使用してツール固有のフォーマットに変換できます。

> [!NOTE]
> 暫定: 各種Agentの独自フィールドを利用したい場合も、該当のAgent以外では無視されることを期待し、汎用テンプレートに直接追記する方針としています。

## スキル一覧

### skill-converter

スキルを各AI Agent固有のフォーマットに変換するスキル。

- 汎用的に設計されたスキルを特定のAI Agentツール向けに最適化
- 対象ツールの最新仕様を調査し、ツール固有の拡張を自動提案
- Claude Code、Kiro CLI等の各種フォーマットに対応

### commit

コミット規約に沿ったコミットを作成するスキル。

- Conventional Commitsを基本とした規約に従い、適切なtype/scope/subjectを自動生成
- 複数の論理単位に分割すべき変更は自動判断して複数コミットに分割
- 変更の背景が不明な場合はユーザーに確認
- **オーバーレイ対応**: 端末・プロジェクトごとに規約を差分カスタマイズ可能（後述の `.agent-skills/` 規約のリファレンス実装）
- **フィードバック記録**: 不具合・改善点をローカルファイルに記録（GitHub 未ログイン端末でも失わない）

### adr

アーキテクチャ決定記録（ADR）を作成・更新するスキル。

- 依頼内容とコードベースの推論から各セクションを整形
- 保存先を自動探索し、既存ADRがあればフォーマットを模倣するかテンプレートを使うか選択
- `Proposed`/`Accepted`/`Deprecated`/`Superseded` のステータス管理とsupersede時の相互リンク更新に対応

### terraform-aws-annotated-reference

単一のTerraform AWSリソースに対し、全プロパティの詳細解説が付与されたリファレンステンプレートを生成するスキル。

- Terraform Providerスキーマに基づいた正確な属性一覧を出力
- AWS公式ドキュメントに基づく解説をコメントとして付与
- 必須MCP server: `awslabs.terraform-mcp-server`, `aws-knowledge-mcp-server`

### terraform-aws-annotated-blueprint

要求された構成のTerraformテンプレートを全プロパティの詳細解説付きで生成するスキル。

- 複数リソースで構成されるインフラ全体のテンプレートを生成
- AWS Well-Architectedガイダンス、Checkovセキュリティスキャンに対応
- 必須MCP server: `awslabs.terraform-mcp-server`, `aws-knowledge-mcp-server`

### syncing-aidlc-workflows

AWSの`aidlc-workflows`（AI-DLCワークフロー, `awslabs/aidlc-workflows`のv2ブランチ）のビルド済み成果物を、任意のプロジェクトに取り込み・差分アップデートするスキル。

- ツール（現状Kiro）を選んでビルド済みアセットを配置（`node build.js`は実行せずコミット済みdistを直接利用）
- 上流の更新を3-wayマージで取り込み、ローカルで加えた変更を保持（自動マージできる箇所は反映し、衝突箇所のみ停止）
- 前回取り込み版との上流差分を確認可能。確定は2フェーズ（merge→finalize）で中断・ロールバックが安全
- 取り込んだMarkdownの日本語訳を参考物として併せて保存（import/updateで差分翻訳）

### generating-aidlc-claude-config

`syncing-aidlc-workflows`が取り込んだKiro形式のAI-DLC成果物（`.kiro/`）から、Claude Code向けの設定一式（`.claude/`）を決定論的に生成するスキル。

- 上流`awslabs/aidlc-workflows`はKiro用ビルドのみ配布のため、それをClaude Codeで動かせる形へ変換
- 大半は`.kiro/`→`.claude/`の再配置で成立（コンテンツはinstall root相対パス設計）。Kiro固有の変換は3点のみ
  - `agents/*.json`→`.claude/agents/*.md`（サブエージェント形式へ／ツール名写像 read→Read, write→Write,Edit, shell→Bash）
  - `hooks/*.kiro.hook`→`.claude/settings.json`の`PostToolUse(Task)`フックへ変換し非破壊マージ
  - `aidlc-common/**/*.js`内のハードコード`.kiro`パスを`.claude`へ書換え
- 冪等で再実行可能（上流更新後は再実行するだけで`.claude/`が追従、settings.jsonのフックは重複しない）

### diagramming-domain-models

DDDのドメインモデル図（エンティティ・バリューオブジェクト・集約境界・リポジトリの関係図）を自己完結HTMLとして生成するスキル。

- 中間JSON（唯一の情報源）→ 機械検証 → 決定論的レンダリングの3層構成。モデル変更はJSON編集で行い、HTMLは常に再生成
- **ドメイン層に閉じたピュアな図を機械的に保証**: スキーマのキー白リストと禁止語彙チェック（UseCase/Controller/DTO等をERROR）で非ドメイン要素の混入を構造的に拒否
- 既存コードのドメイン層からの逆生成と、対話によるゼロからのモデリングの両方に対応
- 生成HTMLはCSS/JS同梱・外部依存ゼロ。フォーカスモード・集約の折りたたみ・詳細度切替・ライト/ダークテーマ・型名クリックジャンプ等のインタラクション付き
- 必要環境: Node.js 18+（npm依存なし）

## リポジトリ構成

- `skills/<skill-name>/` … スキル本体（`SKILL.md`・`lib`/`scripts`・`references`・テスト定義 `evals/`）。git 管理対象。
- `.skill-workspaces/<skill-name>/` … `skill-creator` による評価・ベンチの実行成果物。再生成可能なため git 管理外（`.gitignore` 済み）。

スキル開発時の evals/workspace の管理方針の詳細は [`CLAUDE.md`](./CLAUDE.md) を参照。

## ローカルカスタマイズとフィードバック（`.agent-skills/`）

スキルは `gh skill install` で各端末に**リードオンリー複製**として配布される（再インストールで上書き）。かつ利用端末は当該 GitHub アカウントに未ログインの場合があり、スキル本体を直接編集して push できない。そこで、スキルが**実行時に読み書きするツール非依存のローカル層** `.agent-skills/` を規約として設ける。

```
.agent-skills/<skill-name>/            # プロジェクト: <repo root>/ ／ グローバル: $HOME/
├── <既定ファイル名>.overlay.md         # 予約名。同名の既定 references を「差し替え」（コミット可）
├── *.overlay.md                       # 予約名以外。必ず「追加」読み込み（コミット可）
├── .gitignore                         # feedback.md を除外（中身は feedback.md の1行）
└── feedback.md                        # 不具合・改善点のローカル記録（追記式・コミットしない）
```

- **`.overlay.md`（プラグイン）**: スキル本体を編集せず、専用拡張子 `.overlay.md` の外部ファイルで挙動を変える。**2系統**ある。
  - **差し替え**: 予約名 `<既定ファイル名>.overlay.md`（例: 既定 `commit-conventions.md` に対する `commit-conventions.overlay.md`）は、**同名の既定リファレンスファイルの代わりに**読まれる（完全置換）。
  - **追加**: 予約名以外の `*.overlay.md` は**必ず追加**で読み込まれ、ベースに append される（複数可）。
  - 優先順位は **プロジェクト（`<repo root>/`） > グローバル（`$HOME/`） > スキル既定**。
- **feedback.md（イシュー記録）**: 不具合・改善点をその場で記録。GitHub Issue 化はせず、後日ユーザーが手動で回収する。**コミットしない**（各スキルフォルダの `.gitignore` で除外。overlay 系はコミット可能なまま）。
- スキル別フォルダ（concern 別プールにしない）で**各スキルに自己完結でカプセル化**する方針。overlay/feedback の手順・様式は各スキルの `references/` 内に持つ。
- `.claude/skills/` 等の再インストールで上書きされる場所の**外**に置くため、カスタマイズ/ログは消えない。
- `.local/`（再生成キャッシュ）・`.skill-workspaces/`（評価成果物）とは役割が異なる。

現在のリファレンス実装は `commit` スキル（[`skills/commit/references/overlay-guide.md`](./skills/commit/references/overlay-guide.md) ／ [`feedback-schema.md`](./skills/commit/references/feedback-schema.md)）。他スキルへは同じパターンを各スキルの `references/` に複製して順次展開する。

## インストール方法

```bash
gh skill install Donngi/agent-skills
```

