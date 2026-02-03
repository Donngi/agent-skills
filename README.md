# Agent Skills

AI Agentで利用可能なスキル集です。

本リポジトリに含まれるスキルは、特定のAI Agent（Claude Code、Kiro CLI等）に依存しない汎用的なフォーマットで記述されています。そのため、スキル機能をサポートする様々なAI Agentで利用可能です。

特定のAI Agentに最適化したい場合は、`skill-converter`スキルを使用してツール固有のフォーマットに変換できます。

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

## インストール方法

[skills](https://github.com/vercel-labs/skills)を使用してスキルをインストールできます。

```bash
npx skills add Donngi/agent-skills
```

