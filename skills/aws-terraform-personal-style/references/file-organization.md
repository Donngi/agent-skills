# File Organization

Terraformファイルの分割・配置の規約。

## 原則

**1 ファイル = 1 関心事**。1つの `.tf` ファイルに複数のAWSサービスや用途を混在させない。

## ディレクトリ構造

### リポジトリ全体

```
terraform/
├── envs/
│   ├── <env_name>/         # 例: prod, stg, local
│   │   ├── main.tf         # module呼び出し
│   │   ├── providers.tf    # provider定義（alias含む）
│   │   ├── versions.tf     # required_version / required_providers
│   │   └── backend.tf      # backend "s3" 定義（localを除く）
│   └── ...
└── modules/
    ├── <module_name>/
    │   ├── variables.tf
    │   ├── outputs.tf
    │   ├── versions.tf     # required_version / required_providers（module側も必須。configuration_aliasesが必要ならここに書く）
    │   ├── locals.tf       # 必要に応じて
    │   ├── data.tf         # 必要に応じて
    │   ├── <service>_<resource>.tf
    │   ├── iam_<component>.tf
    │   └── ...
    └── ...
```

### env配下は4点構成

env配下（`terraform/envs/<env>/`）は原則 **4つのファイル** に限定する。

- `main.tf` — `module` ブロックで modules/ を呼び出す
- `providers.tf` — `provider "aws"` ブロック（必要ならalias付き）
- `versions.tf` — `required_version` と `required_providers`
- `backend.tf` — `terraform { backend "s3" { ... } }`

※ ローカル環境（LocalStack等）では `backend.tf` を置かないこともある。

## モジュール内のファイル分割ルール

### 1. リソース種別ごとに分割

AWSサービス名とリソース名を組み合わせたファイル名を使う。

```
lambda_web_app.tf              # aws_lambda_function.web_app
cloudfront_distribution.tf     # aws_cloudfront_distribution.xxx
cloudfront_oac.tf              # aws_cloudfront_origin_access_control.xxx
dynamodb_article.tf            # aws_dynamodb_table.article
ecr.tf                         # aws_ecr_repository.xxx
scheduler_warmer.tf            # aws_scheduler_schedule.warmer
cloudwatch_logs_cloudfront.tf  # aws_cloudwatch_log_group.cloudfront
```

1つのLambda関数が複数のリソース（関数本体 + permission等）を持つ場合、それらは**同じファイル** にまとめて良い（同一コンポーネントの付随リソース）。

### 2. IAMは `iam_<component>.tf`

IAMは `iam_<component>.tf` という名前で**専用ファイル**を作る。role/policy/attachmentの3点は同一ファイルにまとめる（詳細は references/iam.md）。

```
iam_lambda.tf             # Lambda用IAM
iam_lambda_edge.tf        # Lambda@Edge用IAM
iam_scheduler.tf          # EventBridge Scheduler用IAM
iam_pipes.tf              # EventBridge Pipes用IAM
```

### 3. 共通ファイルの役割

| ファイル | 用途 |
|---|---|
| `variables.tf` | モジュールの全入力変数（**変数が無くても空で置く**） |
| `outputs.tf` | モジュールの全出力（**outputが無くても空で置く**） |
| `locals.tf` | 複数箇所で参照する定数、長い式の可読化 |
| `data.tf` | 全 `data` ソース（`aws_region`, `aws_caller_identity`, `aws_ssm_parameter` 等） |
| `providers.tf` | env配下のみ（`provider "aws" { ... }` ブロック）。moduleでは使わない（`configuration_aliases` は `versions.tf` に書く） |
| `versions.tf` | `required_version` / `required_providers` を宣言（**moduleにも必須**） |

### 4. `variables.tf` / `outputs.tf` は空でも必ず置く

すべてのモジュールに `variables.tf` と `outputs.tf` を置く。**中身が空でも必ず作る**。

- 入力変数がないモジュールでも `variables.tf` を置く → 「このモジュールは外部から何も受け取らない」という意図が明示できる
- 出力がないモジュールでも `outputs.tf` を置く → 「このモジュールは外部に何も公開していない」という意図が明示できる

```hcl
# variables.tf
# このモジュールは外部からの入力変数を持たない。
```

```hcl
# outputs.tf
# このモジュールは外部への出力を持たない。
```

どのモジュールにも `variables.tf` と `outputs.tf` が必ず存在する状態にすることで、モジュールのI/Fがどこに書かれているか迷わずに済む。

## サンプル: 典型的なモジュール構造

Lambda + DynamoDB + CloudWatch Logs を持つモジュール:

```
modules/<component>/
├── variables.tf
├── outputs.tf
├── data.tf                     # aws_region など
├── lambda_<component>.tf       # aws_lambda_function + aws_lambda_permission
├── iam_lambda.tf               # role + policy + attachment
├── dynamodb_<table>.tf         # aws_dynamodb_table
└── cloudwatch_logs.tf          # aws_cloudwatch_log_group
```

## アンチパターン

### NG: 1ファイルに全部詰め込む

```
modules/<component>/
└── main.tf   # ❌ lambda, iam, dynamodb が全部入ってる
```

### NG: 粒度が粗すぎる分割

```
modules/<component>/
├── lambda.tf  # ❌ 複数のLambda（web_app, warmer, edge）が混在
```

→ Lambda関数ごとにファイルを分ける（`lambda_web_app.tf`, `lambda_warmer.tf`, `lambda_edge.tf`）。

### NG: IAMを本体ファイルに混ぜる

```
# lambda_web_app.tf
resource "aws_lambda_function" "web_app" { ... }
resource "aws_iam_role" "web_app" { ... }        # ❌ IAMは iam_lambda.tf へ
resource "aws_iam_policy" "web_app" { ... }      # ❌
```

### NG: `variables.tf` / `outputs.tf` を作らない

モジュールに `variables.tf` や `outputs.tf` が存在しないのは規約違反。入力変数や出力が無くても空ファイルを置く。
