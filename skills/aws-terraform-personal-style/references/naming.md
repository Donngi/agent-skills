# Naming

Terraformリソースの命名規約。Terraform内部の「local name」とAWS上の「リソース名」を区別して扱う。

## Terraform resource local name

`resource "aws_xxx" "<local_name>"` の `<local_name>` 部分。

### ルール

- **snake_case** で書く
- **リソース種別を接尾辞として付けない**（AWSサービス名は `aws_xxx` の方に含まれているため冗長）
- モジュール内で一意になる範囲で、**コンポーネント名のみ**を使う

### OK / NG

```hcl
# ✅ OK
resource "aws_lambda_function" "web_app"            { ... }
resource "aws_dynamodb_table"   "article"           { ... }
resource "aws_iam_role"         "web_app_lambda"    { ... }  # lambda用IAMであることをlocal nameで識別
resource "aws_cloudfront_distribution" "web_app"    { ... }

# ❌ NG: 冗長な接尾辞
resource "aws_lambda_function" "web_app_lambda"     { ... }  # 種別が重複
resource "aws_dynamodb_table"  "article_table"      { ... }  # 種別が重複
```

### モジュール内に同種のリソースが複数ある場合

用途で区別できる名前を付ける。

```hcl
# ✅ OK
resource "aws_lambda_function" "web_app" { ... }
resource "aws_lambda_function" "warmer"  { ... }
resource "aws_lambda_function" "edge"    { ... }

resource "aws_iam_role" "web_app_lambda" { ... }  # web_app Lambda用
resource "aws_iam_role" "warmer_lambda"  { ... }  # warmer Lambda用
resource "aws_iam_role" "edge_lambda"    { ... }  # edge Lambda用
```

## AWS上のリソース名 (`name` attribute)

`name = "..."` で指定するAWSコンソール上で見える名前。

### ルール

- **kebab-case** で書く
- リソース種別を示す接尾辞は、**AWSコンソールでの区別が必要な場合のみ**付ける

### 例

```hcl
resource "aws_lambda_function" "web_app" {
  function_name = "web-app"
}

resource "aws_dynamodb_table" "article" {
  name = "article-table"
}

resource "aws_cloudfront_distribution" "web_app" {
  # name相当はない
}
```

### IAM role名

`<component>-<compute_type>-role` 形式。複数のIAM roleがアカウント内に混在するため、用途が即座に分かる名前にする。

```hcl
resource "aws_iam_role" "web_app_lambda" {
  name = "web-app-lambda-role"
}

resource "aws_iam_role" "warmer_scheduler" {
  name = "warmer-scheduler-role"
}

resource "aws_iam_role" "pipes_dynamodb_stream" {
  name = "article-enhancer-pipes-role"
}
```

### IAM inline policy名

対応する role 名を基準に **`${aws_iam_role.xxx.name}-policy`** として派生させる。role との紐付きが名前から自明になる。

```hcl
resource "aws_iam_role" "web_app_lambda" {
  name = "web-app-lambda-role"
}

resource "aws_iam_policy" "web_app_lambda" {
  name = "${aws_iam_role.web_app_lambda.name}-policy"   # → "web-app-lambda-role-policy"
  # ...
}
```

## プロジェクト固有の命名（特定値は固定しない）

以下は**プロジェクトごとに自由**に決めて良い（このSkillでは固定しない）:

- DynamoDB table名の suffix（`-table` を付けるかどうか）
- GSI名（例: `GSI-dataType`, `by-url`, 好きに）
- S3 bucket prefix
- SSM Parameter path

## アンチパターン

### NG: local nameにリソース種別を重複させる

```hcl
# ❌
resource "aws_lambda_function" "web_app_function" { ... }
resource "aws_iam_role"        "lambda_iam_role"  { ... }
```

→ `aws_lambda_function.web_app`, `aws_iam_role.lambda` 等に。

### NG: AWS名をsnake_caseにする

```hcl
# ❌
resource "aws_lambda_function" "web_app" {
  function_name = "web_app_function"   # AWS側はkebab-case
}
```

→ `function_name = "web-app"` 等に。

### NG: IAM role名が用途を表さない

```hcl
# ❌
resource "aws_iam_role" "lambda" {
  name = "my-role-1"
}
```

→ `"<component>-<compute_type>-role"` 形式で、コンポーネントと用途を明示する。

### NG: inline policy名をrole名から独立させる

```hcl
# ❌
resource "aws_iam_role" "web_app_lambda" {
  name = "web-app-lambda-role"
}

resource "aws_iam_policy" "web_app_lambda" {
  name = "custom-policy-for-webapp"   # roleとの関連が名前から読めない
}
```

→ `"${aws_iam_role.web_app_lambda.name}-policy"` で派生させる。
