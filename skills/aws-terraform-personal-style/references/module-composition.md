# Module Composition

モジュール間のデータ受け渡しと、env からの module 呼び出しの規約。

## 原則

**同一リソースから複数のmetadataを受け渡す必要があるときは、`object` に集約して渡す**。

- 1つのリソース（例: DynamoDB table）から `name` と `arn` の両方が必要 → 1つの `object` 変数にまとめる
- 単一値しか渡さない（例: `string` 1個、model ID 1個） → primitive型のまま渡してよい
- 複数値でも**同一リソース由来ではない**（例: env共通設定、無関係な2つの値） → 無理に集約せず個別variableでよい

集約する動機は、参照先リソースの attribute を1つ増やすときに variable を追加せずに済み、変更の波及範囲が局所化されることにある。**「1 object = 1 リソースのmeta情報」** という対応関係が崩れる集約は避ける。

## meta object パターン（同一リソースの複数attribute受け渡し）

### モジュールのoutput側

関連するattributeを1つのobjectに集約して出力する。

```hcl
# modules/shared_db/outputs.tf
output "dynamodb_article_table_meta" {
  value = {
    name       = aws_dynamodb_table.article.name
    arn        = aws_dynamodb_table.article.arn
    stream_arn = aws_dynamodb_table.article.stream_arn
  }
}

output "dynamodb_feed_table_meta" {
  value = {
    name = aws_dynamodb_table.feed.name
    arn  = aws_dynamodb_table.feed.arn
  }
}
```

命名: `<something>_meta`（または `<something>_metadata`）。

### モジュールのinput側

受け取る側は `object` 型で明示する。必要なキーだけをtypeに宣言する。

```hcl
# modules/consumer/variables.tf
variable "dynamodb_article_table_meta" {
  type = object({
    name = string
    arn  = string
  })
  description = "shared_dbモジュールが出力するarticleテーブルのmeta情報。nameとarnのみ使用する。"
}
```

### env側での配線

envs/<env>/main.tf で、片方のモジュール出力を他方に渡す。

```hcl
# envs/prod/main.tf
module "shared_db" {
  source = "../../modules/shared_db"
}

module "consumer" {
  source = "../../modules/consumer"

  dynamodb_article_table_meta = module.shared_db.dynamodb_article_table_meta
}
```

## 必要なキーだけのサブセットを作る

受け取り側モジュールが出力の**一部キー**しか使わない場合は、env側でサブセットobjectを作って渡す。

```hcl
# envs/prod/main.tf
module "article_writer" {
  source = "../../modules/article_writer"

  # article_tableのmetaから name と arn だけが必要
  dynamodb_article_table_meta = {
    name = module.shared_db.dynamodb_article_table_meta.name
    arn  = module.shared_db.dynamodb_article_table_meta.arn
  }
}
```

受け取り側の variable type は受け取るキーだけを宣言する（`stream_arn` は不要なので型にも含めない）。

## 論理的に一体のリソース群をまとめて渡す

厳密には「同一リソース」ではなくても、**1つの機能を構成する不可分なリソース群**（例: S3 bucket + その中のindex、VPC + subnet群）のmetaは1つの object にまとめて良い。

```hcl
# envs/prod/main.tf
module "web_app" {
  source = "../../modules/web_app"

  # knowledge_vectorsモジュール配下の bucket と index は1機能の構成要素なので集約
  knowledge_vectors_meta = {
    bucket_name = module.knowledge_vectors.vector_bucket_meta.name
    bucket_arn  = module.knowledge_vectors.vector_bucket_meta.arn
    index_name  = module.knowledge_vectors.index_meta.name
    index_arn   = module.knowledge_vectors.index_meta.arn
  }
}
```

**判断基準**: 片方だけ渡すことがあり得ないほど密結合しているなら集約OK。それぞれ独立して使う可能性があるなら個別variableに分ける。

## aliased providerの受け渡し

module側で `configuration_aliases` を宣言している場合、env側で `providers` ブロックで明示的にマッピングする。

```hcl
# envs/prod/main.tf
module "web_app" {
  source = "../../modules/web_app"

  # ... 他のvariable ...

  providers = {
    aws.us-east-1 = aws.us-east-1
  }
}
```

## モジュール間の依存方向

- **共有リソース（DynamoDB、VPC、Cognito等）** を持つモジュールを先に定義し、それを使う側のモジュールに出力を渡す
- 循環依存は避ける。どうしても発生する場合はハードコードで切る（コメントで明記）
- 共有モジュール（例: `shared_db`）は `envs/<env>/main.tf` の先頭近くで呼び出す

## サンプル: env全体の構造

```hcl
# envs/prod/main.tf

# ── 共有リソース ──
module "shared_db" {
  source = "../../modules/shared_db"
}

module "auth" {
  source = "../../modules/auth"

  application_domain = "example.com"
}

# ── コンシューマー ──
module "web_app" {
  source = "../../modules/web_app"

  cognito_meta                = module.auth.cognito_meta
  dynamodb_article_table_meta = module.shared_db.dynamodb_article_table_meta
  dynamodb_feed_table_meta    = module.shared_db.dynamodb_feed_table_meta

  providers = {
    aws.us-east-1 = aws.us-east-1
  }
}

module "article_writer" {
  source = "../../modules/article_writer"

  dynamodb_article_table_meta = {
    name = module.shared_db.dynamodb_article_table_meta.name
    arn  = module.shared_db.dynamodb_article_table_meta.arn
  }
}
```

## アンチパターン

### NG: 関連attributeを個別variableで渡す

```hcl
# ❌
variable "dynamodb_article_table_name" { type = string }
variable "dynamodb_article_table_arn"  { type = string }

module "consumer" {
  dynamodb_article_table_name = module.shared_db.dynamodb_article_table_name
  dynamodb_article_table_arn  = module.shared_db.dynamodb_article_table_arn
}
```

→ `dynamodb_article_table_meta = { name, arn }` で集約する。

### NG: moduleの全attributeをそのまま渡す意図で `any` を使う

```hcl
# ❌
variable "dynamodb_article_table_meta" {
  type = any
}
```

→ 使うキーを明示的に `object({...})` で宣言する。

### NG: 個別attributeの羅列

```hcl
# ❌
module "web_app" {
  bucket_name = module.knowledge_vectors.vector_bucket_meta.name
  bucket_arn  = module.knowledge_vectors.vector_bucket_meta.arn
  index_name  = module.knowledge_vectors.index_meta.name
  index_arn   = module.knowledge_vectors.index_meta.arn
}
```

→ `knowledge_vectors_meta = { bucket_name, bucket_arn, index_name, index_arn }` に集約する。
