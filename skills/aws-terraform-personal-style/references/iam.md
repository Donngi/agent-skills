# IAM

IAM roleとpolicyの書き方の規約。IAMを触るときは必ず読む。

## 原則

1. **1コンポーネント = 1ファイル**。`iam_<component>.tf` というファイルに、対応する全IAMリソースを集約する
2. **3点セット（role + policy + attachment）を同一ファイルに書く**。別ファイルに散らさない
3. **assume role policy と custom policy は両方 inline `jsonencode()` で書く**
4. **Sidは必須**、Actionはワイルドカード禁止

## ファイル構成

ファイル名は `iam_<component>.tf`。1ファイルに以下を全部入れる:

1. `aws_iam_role`（1つ）
2. `aws_iam_policy`（1つ、custom policy）
3. `aws_iam_role_policy_attachment`（custom policy のattach、必要ならAWS managed policy も別attach）

## 完全サンプル

```hcl
# iam_lambda.tf

resource "aws_iam_role" "lambda" {
  name = "<component>-lambda-role"
  assume_role_policy = jsonencode({
    Version : "2012-10-17",
    Statement : [
      {
        Effect : "Allow",
        Principal : {
          Service : "lambda.amazonaws.com"
        },
        Action : "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "lambda" {
  name = "${aws_iam_role.lambda.name}-policy"
  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Sid" : "AllowArticleTableAccess",
        "Effect" : "Allow",
        "Resource" : [
          var.dynamodb_article_table_meta.arn,
        ],
        "Action" : [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
        ]
      },
      {
        "Sid" : "AllowSSMParameterAccess",
        "Effect" : "Allow",
        "Resource" : [
          data.aws_ssm_parameter.secret.arn,
        ],
        "Action" : [
          "ssm:GetParameter",
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_custom" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda.arn
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
```

## assume role policy

- inline `jsonencode()` で書く（data sourceの `aws_iam_policy_document` は使わない）
- `Principal.Service` でsigning serviceを明示
- 複数principalが必要な場合のみ、Statementを複数並べる

## Custom policy

### inline `jsonencode()`

```hcl
resource "aws_iam_policy" "xxx" {
  name = "${aws_iam_role.xxx.name}-policy"
  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [ ... ]
  })
}
```

### Sid 必須

すべての Statement に `Sid` を付ける。

### Sid 命名規約

`Allow<What><Action>` 形式で、何にどういうアクションを許可しているかが一目で分かる名前にする。

```
AllowArticleTableAccess          # article tableへのアクセス全般
AllowBedrockEmbeddingAccess      # Bedrock embedding modelの呼び出し
AllowSSMParameterAccess          # 特定のSSM Parameterの参照
AllowS3VectorsAccess             # S3 Vectorsへのアクセス
AllowCloudWatchLogsWrite         # CloudWatch Logsへの書き込み
```

### 1 Sid = 1 リソース/用途

1つの Statement は **1つのリソース or 用途** に対応させる。複数リソースを1つのStatementに混ぜない。

```hcl
# ✅ OK: リソースごとにStatement分割
{
  "Sid" : "AllowArticleTableAccess",
  "Effect" : "Allow",
  "Resource" : [var.article_table_meta.arn],
  "Action" : ["dynamodb:GetItem", "dynamodb:PutItem"]
},
{
  "Sid" : "AllowFeedTableAccess",
  "Effect" : "Allow",
  "Resource" : [var.feed_table_meta.arn],
  "Action" : ["dynamodb:GetItem", "dynamodb:Query"]
},
```

### Action は明示列挙、ワイルドカード禁止

```hcl
# ✅ OK
"Action" : [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
]

# ❌ NG
"Action" : "dynamodb:*"
"Action" : ["dynamodb:Get*"]
```

### Resource は具体ARNを書く

`"*"` は使わない。data sourceや var から具体ARNを参照する。

```hcl
# ✅ OK
"Resource" : [
  var.bucket_meta.arn,
  "${var.bucket_meta.arn}/*",
]

# ❌ NG
"Resource" : "*"
```

## Attachment

### Custom policy の attach

```hcl
resource "aws_iam_role_policy_attachment" "<component>_custom" {
  role       = aws_iam_role.<component>.name
  policy_arn = aws_iam_policy.<component>.arn
}
```

### AWS managed policy の attach

必要に応じて別の attachment で追加する。local nameで用途が分かるようにする。

```hcl
# CloudWatch Logs への基本的な書き込み権限を付与
resource "aws_iam_role_policy_attachment" "<component>_basic_execution" {
  role       = aws_iam_role.<component>.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
```

### attachment の local name 規約

- Custom policy用: `<component>_custom`
- AWS managed: `<component>_<purpose>` （例: `<component>_basic_execution`, `<component>_xray_write`）

## アンチパターン

### NG: role/policy/attachmentを別ファイルに分ける

```
modules/<component>/
├── iam_role.tf              # ❌
├── iam_policy.tf            # ❌
└── iam_attachment.tf        # ❌
```

→ `iam_<component>.tf` の1ファイルに3点まとめる。

### NG: Sid を省略

```hcl
# ❌
{
  "Effect" : "Allow",
  "Resource" : [...],
  "Action" : [...]
  // Sid なし
}
```

→ 必ず `Sid` を付ける。

### NG: ワイルドカード Action

```hcl
# ❌
"Action" : "s3:*"
```

→ 必要なActionだけ列挙する。

### NG: `Resource: "*"` の乱用

```hcl
# ❌
"Resource" : "*"
```

→ 具体ARN（var や data経由）を指定する。

### NG: assume role policy に aws_iam_policy_document data source を使う

```hcl
# ❌
data "aws_iam_policy_document" "assume_role" { ... }

resource "aws_iam_role" "xxx" {
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}
```

→ inline `jsonencode()` で統一する（シンプルなケースが大半なので data source を挟む必要がない）。

### NG: 1 Statement に異なる用途のリソースを混ぜる

```hcl
# ❌
{
  "Sid" : "AllowDatabaseAccess",
  "Effect" : "Allow",
  "Resource" : [
    var.article_table_meta.arn,
    var.feed_table_meta.arn,
    var.bucket_meta.arn,   # S3まで混ざってる
  ],
  "Action" : [
    "dynamodb:GetItem",
    "s3:GetObject",   # DynamoDBとS3が混在
  ]
}
```

→ リソース/用途ごとに Statement を分割する。
