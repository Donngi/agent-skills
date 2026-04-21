# Variables and Locals

`variable` と `locals` の使い分けと、それぞれの書き方の規約。

## variable

### 型は常に明示する

`type` を必ず書く。`type` が省略された variable は書かない。

```hcl
# ✅ OK
variable "bedrock_model_id" {
  type        = string
  description = "Bedrockで利用するfoundation model ID。"
}

# ❌ NG
variable "bedrock_model_id" {
  description = "Bedrockで利用するfoundation model ID。"
  # typeがない
}
```

### 型の選び方

単一値なら primitive型、関連attributeを複数まとめて渡すなら `object({...})` を使う。**object必須ではない**。

| 渡したい内容 | 推奨type |
|---|---|
| 単一の文字列（IDやpath） | `string` |
| 数値（容量・タイムアウト） | `number` |
| boolean flag | `bool` |
| 複数の関連attribute（例: name + arn） | `object({...})` |
| 同種要素のリスト | `list(string)`, `list(object({...}))` |
| キー付きデータ | `map(string)`, `map(object({...}))` |

### `object` 型のサンプル

```hcl
variable "dynamodb_article_table_meta" {
  type = object({
    name       = string
    arn        = string
    stream_arn = string
  })
  description = "DynamoDB article tableのメタ情報。stream_arn は Lambda eventsource 用に使用する。"
}
```

必要なキーだけをtypeに含める（受け取り側が使わないキーは型に書かない）。

### primitive型のサンプル

```hcl
variable "application_domain" {
  type        = string
  description = "アプリケーションが配信されるドメイン名。Cognito callback URLのhostとして使う。"
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrockで利用するfoundation model ID。"
}
```

### description

- 日本語可
- **「何に使うか」「どういう値を期待するか」** を書く
- 出所（どのモジュールの出力か）や制約（長さ・フォーマット）があれば書く

### default は**禁止**

variable に `default` は**付けない**。すべての variable は env 側から明示的に指定する。

**理由**:
- defaultがあると「どの値が実際に使われているか」がenv配下だけ見ても分からなくなる（moduleまで追う必要が生じる）
- すべての変数がenvで明示される状態を保つことで、環境ごとの差分がenv側に一元化される
- 「よく使う値」だとしても、defaultで隠すより env 側にベタ書きして可視化する方が読みやすい

固定値として扱いたい定数は variable ではなく **`locals` か直接ハードコード** で書く。

### 値の制約を `validation` で強制する

フォーマット・範囲・許容値が決まっている variable は **`validation` ブロック** を付ける。plan時にエラーにできるので、誤った値がapplyされる前に検知できる。

```hcl
variable "bedrock_model_id" {
  type        = string
  description = "Bedrockで利用するfoundation model ID。"

  validation {
    condition     = can(regex("^(anthropic|amazon)\\.", var.bedrock_model_id))
    error_message = "bedrock_model_idは anthropic. または amazon. で始まる必要がある。"
  }
}

variable "memory_size_mb" {
  type        = number
  description = "Lambdaのmemory size (MB)。"

  validation {
    condition     = var.memory_size_mb >= 128 && var.memory_size_mb <= 10240
    error_message = "memory_size_mbは128〜10240の範囲で指定する。"
  }
}
```

複数の制約を付けたい場合は `validation` ブロックを複数並べる（Terraform 1.9+ でサポート）。

### `sensitive` / `nullable` / `ephemeral` の使い分け

| 属性 | 用途 |
|---|---|
| `sensitive = true` | plan/apply出力でマスクしたい値（APIキー、secret等） |
| `nullable = false` | `null` を受け付けたくない variable（デフォルトは `true`） |
| `ephemeral = true` | state/planに保存したくない一時値（Terraform 1.10+、短命な credential 等） |

```hcl
variable "api_key" {
  type        = string
  description = "外部サービスのAPIキー。"
  sensitive   = true
  nullable    = false
}
```

秘密情報は原則 `sensitive = true` を付ける。state やログに生値が残らない。

## locals

### 使いどころ

以下の場合に `locals` を使う:

1. **同じ値を複数箇所で参照する定数**（ハードコードの一元化）
2. **長い式の可読化**（繰り返し現れるARN構築等）
3. **計算結果のキャッシュ**（条件分岐・map変換）

### 書き方

```hcl
# locals.tf
locals {
  log_retention_in_days = 30

  bedrock_model_arn = "arn:aws:bedrock:${data.aws_region.current.region}::foundation-model/${var.bedrock_model_id}"
}
```

### env vs module

- **module内のlocals**: そのモジュール内に閉じる値（繰り返し使う定数・派生値）
- **envのlocals**: 複数のモジュールに渡す共通値（モジュール間で統一したい値）

## サンプル: 典型的な variables.tf

```hcl
# modules/consumer/variables.tf

variable "dynamodb_article_table_meta" {
  type = object({
    name = string
    arn  = string
  })
  description = "shared_dbから渡されるarticle tableのmeta情報。"
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrockで利用するfoundation model ID。"
}

variable "enable_xray" {
  type        = bool
  description = "X-Rayトレーシングを有効にするかどうか。"
}
```

## アンチパターン

### NG: 関連値を個別variableでバラバラに受け取る

```hcl
# ❌
variable "table_name" { type = string }
variable "table_arn"  { type = string }
```

→ `variable "table_meta" { type = object({ name = string, arn = string }) }` に集約する。

### NG: `type = any` で逃げる

```hcl
# ❌
variable "config" { type = any }
```

→ 受け取るキーを `object({...})` で明示する。

### NG: すべてを object に詰め込む

```hcl
# ❌ 単一文字列をobjectで渡す
variable "model" {
  type = object({
    id = string
  })
}
```

→ 単一値なら `string` で十分。

### NG: description に「何をするか」だけ書いて値の制約・由来を書かない

```hcl
# ❌
variable "domain" {
  type        = string
  description = "ドメイン"   # 値の形式・由来が不明
}
```

→ 「アプリケーションのFQDN。Cognito callback URLで使う。末尾スラッシュ無し」のように、**使い方・制約**を書く。

### NG: variable に default を付ける

```hcl
# ❌
variable "enable_xray" {
  type    = bool
  default = true
}

# ❌
variable "bucket_arn" {
  type    = string
  default = null
}
```

→ `default` は**全面禁止**。すべて env 側で明示指定する。固定値にしたいものは variable ではなく `locals` か直接ハードコード。

### NG: localsを「変数の別名」として使う

```hcl
# ❌
locals {
  bucket_name = var.bucket_name   # 変数をそのまま別名で受け直しているだけ
}
```

→ `var.bucket_name` を直接使う。locals は**計算結果・定数** に限定。
