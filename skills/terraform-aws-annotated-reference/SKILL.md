---
name: terraform-aws-annotated-reference
description: 単一のTerraform AWSリソースに対する全プロパティ解説付きリファレンステンプレートを生成する。ユーザーがリソース名（例：aws_s3_bucket, aws_lambda_function）を指定すると、Providerスキーマに基づいた正確な属性一覧とAWS公式ドキュメントに基づく解説を含むテンプレートを出力する。「aws_xxxのテンプレートを作成して」「aws_xxxの全プロパティを教えて」などのリクエストで使用。
---

# Terraform AWS Annotated Reference

単一AWSリソースの全プロパティに詳細解説付きのリファレンステンプレートを生成する。

## 前提条件

以下のMCP serverが必須。利用不可の場合は警告・設定方法を表示し作業を終了する。

**必須MCP server:**
- `awslabs.terraform-mcp-server` - AWSプロバイダードキュメント・実装例の検索
- `aws-knowledge-mcp-server` - AWS公式ドキュメント参照用

**MCP server設定例:**
```json
{
  "aws-knowledge-mcp-server": {
    "command": "uvx",
    "args": ["fastmcp", "run", "https://knowledge-mcp.global.api.aws"]
  },
  "awslabs.terraform-mcp-server": {
    "command": "uvx",
    "args": ["awslabs.terraform-mcp-server@latest"],
    "env": {
      "FASTMCP_LOG_LEVEL": "ERROR"
    }
  }
}
```

## 重要な原則

**スキーマが信頼の源泉（Source of Truth）**

`terraform providers schema -json` から取得したスキーマを正とする。MCPサーバーのドキュメントはスキーマに含まれない補足情報（説明文、設定可能な値の詳細等）の取得に使用する。

**AWS公式の情報のみを利用**

インターネット検索は使用しない。情報取得はMCPサーバーのみを使用し、AWSの公式情報のみを利用する。

## 動作上の禁止事項

- 必須mcpサーバー以外を利用したインターネット検索
- ワークフローに記載されていない中間ファイルの生成

## ワークフロー

### 1. 入力の確認

ユーザーから以下を取得:
- **リソース名** (必須): `aws_cloudwatch_log_group` など
- **AWS Providerバージョン** (任意): 指定がなければ最新バージョンを使用
- **出力先ディレクトリ** (任意): 指定がなければ `${PROJECT_ROOT}/.local/terraform-aws-annotated-reference/${PROVIDER_VERSION}` を使用

**入力例:**

自然言語での指定:
```
aws_s3_bucketのテンプレートを作成して
aws_lambda_functionのテンプレートを ./terraform/refs に出力して
aws_iam_role（v5.80.0）のリファレンスを ./docs/terraform に作成して
```

引数形式での指定:
```
/terraform-aws-annotated-reference aws_s3_bucket
/terraform-aws-annotated-reference aws_lambda_function --output ./terraform/refs
/terraform-aws-annotated-reference aws_iam_role --version 5.80.0 --output ./docs/terraform
```

バージョン未指定時はTerraform Registry APIから最新バージョンを取得:
```bash
curl -s "https://registry.terraform.io/v1/providers/hashicorp/aws" | jq -r '.version'
```

### 2. スキーマの存在確認と取得

`.local/terraform-aws-annotated-reference/${provider_version}/schema.json` が既に存在するか確認:

```bash
WORK_DIR="${PROJECT_ROOT}/.local/terraform-aws-annotated-reference"
SCHEMA_FILE="${WORK_DIR}/${provider_version}/schema.json"
if [[ -f "$SCHEMA_FILE" ]]; then
  echo "スキーマファイルが存在します。スキップします。"
else
  echo "スキーマを取得します..."
  # 以下のステップ2a, 2bを実行
fi
```

#### 2a. スキーマ取得用Terraform設定の作成（スキーマが存在しない場合のみ）

`.local/terraform-aws-annotated-reference/${provider_version}/` ディレクトリにプロバイダー設定を作成:

```hcl
# .local/terraform-aws-annotated-reference/${provider_version}/providers.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "{provider_version}"
    }
  }
}
```

#### 2b. プロバイダースキーマの取得（スキーマが存在しない場合のみ）

```bash
cd .local/terraform-aws-annotated-reference/${provider_version}
terraform init
terraform providers schema -json > schema.json
```

### 3. スキーマからリソース情報を抽出

スキーマJSONから対象リソースの情報を抽出:

```bash
jq '.provider_schemas["registry.terraform.io/hashicorp/aws"].resource_schemas["${RESOURCE_NAME}"]' schema.json > "schema_${RESOURCE_NAME}.json"
```

抽出対象:
- `.block.attributes` - 通常の属性
- `.block.block_types` - ネストブロック（vpc_config等）

### 4. 属性の分類

スキーマの各属性を以下のルールで分類:

**テンプレートに含める属性（入力可能）:**
- `optional: true` を持つ属性
- `required: true` を持つ属性

**テンプレートから除外する属性（computed only）:**
- `computed: true` かつ `optional` がない属性
- 例: `arn`, `id`, `tags_all`

**分類確認コマンド:**
```bash
# 入力可能な属性一覧
jq -r '.block.attributes | to_entries[] | select(.value.optional == true) | .key' "schema_${RESOURCE_NAME}.json"

# computed only属性一覧
jq -r '.block.attributes | to_entries[] | select(.value.computed == true and .value.optional != true) | .key' "schema_${RESOURCE_NAME}.json"
```

### 5. ドキュメント情報の取得

`aws-knowledge-mcp-server`を使用して補足情報を取得:
- `aws___search_documentation` でAWS公式ドキュメントを検索
- `aws___read_documentation` で詳細情報を取得

### 6. テンプレート生成

[references/template_example.md](references/template_example.md) のフォーマットに従いテンプレートを生成。
ネストブロックを含むリソースは [references/nested_block_example.md](references/nested_block_example.md) も参照。

**必須要件:**
- スキーマから取得した入力可能な全属性を記載
- ネストブロック（block_types）も漏れなく記載
- 各プロパティにコメントで解説を記載
- AWS公式ドキュメントのURLは実在するもののみ記載
- 推測や誤った情報は絶対に記載しない
- ファイルヘッダーやプロパティのコメントは必ず[references/template_example.md](references/template_example.md) のフォーマットと同一とする
- 言語は日本語とする

### 6.1 フォーマットルール

以下のルールを厳守すること。違反はvalidate_template.shで自動検出される。

**FR-1: 全コメント日本語**
```hcl
# ✅ OK
# 設定内容: ロググループの名前を指定します。

# ❌ NG
# Description: The name of the log group.
```

**FR-2: 区切り線は `#-------` のみ（`====` 禁止）**
```hcl
# ✅ OK
#---------------------------------------------------------------
# 基本設定
#---------------------------------------------------------------

# ❌ NG
# ============================================================
# Basic Configuration
# ============================================================
```

**FR-3: プロパティコメントに `設定内容:`, `設定可能な値:`, `省略時:` を使用**
```hcl
# ✅ OK
# name (Optional, Forces new resource)
# 設定内容: ロググループの名前を指定します。
# 設定可能な値: 1-512文字の文字列
# 省略時: Terraformがランダムな一意の名前を生成します。

# ❌ NG
# name (Optional, Forces new resource)
# Description: The name of the log group.
# Valid values: 1-512 character string
# Default: Terraform generates a random unique name.
```

**FR-4: 機能カテゴリ別グルーピング（Required/Optionalグルーピング禁止）**
```hcl
# ✅ OK: 機能別
#-------------------------------------------------------------
# 暗号化設定
#-------------------------------------------------------------

# ❌ NG: Required/Optionalグルーピング
# ============================================================
# REQUIRED ARGUMENTS
# ============================================================
```

**FR-5: ネストブロックヘッダーも `#-----` 統一**
ネストブロックのカテゴリ区切り線もトップレベルと同じ `#-----` 形式を使用。

**FR-6: Attributes Reference 25行以内・コード例禁止**
```hcl
# ✅ OK
#---------------------------------------------------------------
# Attributes Reference (読み取り専用属性)
#---------------------------------------------------------------
# このリソースは以下の属性をエクスポートします:
#
# - arn: ロググループのARN
# - tags_all: 継承タグを含む全タグマップ
#---------------------------------------------------------------

# ❌ NG: コード例を含む
# output "log_group_arn" {
#   value = aws_cloudwatch_log_group.example.arn
# }
```

**FR-7: 使用例・ベストプラクティス等の余分なセクション禁止**
テンプレートにはリソース定義とAttributes Referenceのみを記載。使用例、ベストプラクティス、output例等は記載しない。

**ファイルヘッダー:**
```hcl
#---------------------------------------------------------------
# {リソース表示名}
#---------------------------------------------------------------
#
# {どのようなAWSリソースをプロビジョニングするかの説明}
#
# AWS公式ドキュメント:
#   - {ドキュメント名}: {URL}
#
# Terraform Registry:
#   - {URL}
#
# Provider Version: {version}
# Generated: {YYYY-MM-DD}
# NOTE: 本テンプレートは生成時点の情報に基づきAIが生成しています。
#       情報が古くなっている可能性、誤りを含む可能性があるため、
#       正確な最新仕様は公式ドキュメントを参照してください。
#
#---------------------------------------------------------------
```

### 7. 検証

生成したテンプレートに対して検証スクリプトを実行:

```bash
bash "${PROJECT_ROOT}/.claude/skills/terraform-aws-annotated-reference/lib/validate_template.sh" \
  "${OUTPUT_FILE}" \
  "${RESOURCE_NAME}" \
  "${SCHEMA_FILE}"
```

FAILが1つでもあれば、該当箇所を修正して再度検証を実行する。全項目PASSになるまで繰り返す。

### 8. ファイル出力

出力先: `${出力先ディレクトリ}/${リソース名}.tf`

例（デフォルト）: 
出力先ディレクトリ = 指定なし
`${PROJECT_ROOT}/.local/terraform-aws-annotated-reference/${PROVIDER_VERSION}/aws_cloudwatch_log_group.tf`

例（カスタム）: 
出力先ディレクトリ = ${PROJECT_ROOT}/terraform/references
`${PROJECT_ROOT}/terraform/references/aws_cloudwatch_log_group.tf`

## 品質要件

1. **正確性**: スキーマを信頼の源泉とし、MCPサーバーは補足情報として使用
2. **網羅性**: スキーマの全入力可能属性（attributes + block_types）を記載
3. **検証可能性**: 記載するURLは全て実在するものであること
4. **除外の明確性**: computed only属性はAttributes Referenceセクションに記載
5. **統一フォーマット**: references/template_example.md のフォーマットを厳守。拡張子は.tf
