# Comments and Style

コメントの書き方とコードスタイルの規約。

## 原則

- コメントは **日本語** を基本とする
- 「何をしているか」ではなく **「なぜこの設定なのか」** を書く
- コードから自明な内容はコメントにしない
- 必要に応じて AWS 公式ドキュメントへのリンクを貼る

## いつコメントを書くか

以下のような **読者が読んで疑問を持ちうる箇所** に限定して書く:

1. **値の由来・根拠が分かりにくい時**
   - AWS managed policy ID（例: CloudFront managed cache policy）
   - magic number（例: timeout秒数、memory size）
   - 特殊な設定値

2. **複数選択肢の中から選んだ理由がある時**
   - 「なぜこのインスタンスタイプか」
   - 「なぜこのruntimeか」

3. **制約やトレードオフがある時**
   - AWS側の仕様上の制約
   - パフォーマンス・コストのトレードオフ

4. **将来的に見直したい値である時**
   - TODO コメントで「何が理想か」まで書く

## 「なぜ」を書くコメントの例

### magic number の根拠

```hcl
resource "aws_lambda_function" "web_app" {
  memory_size = 1769   # arm64で1 vCPUフル割当になる
  # ...
}
```

### 選定理由

```hcl
resource "aws_lambda_function" "xxx" {
  runtime       = "nodejs22.x"
  architectures = ["arm64"]   # 同一性能でコスト約20%削減のためarm64を選択
  # ...
}
```

### AWS managed ID の出所

```hcl
# Managed Cache Policy: CachingOptimized
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
```

### 制約・仕様上の理由

```hcl
# EventBridge Schedulerは1分未満の間隔を許容しないため、最短でrate(1 minute)
schedule_expression = "rate(1 minute)"
```

## AWS公式ドキュメントへのリンク

以下のような場合にリンクを貼る:

- AWS managed policy ID / cache policy ID の由来
- 特殊な設定値の仕様説明
- API limit やquotaの根拠

```hcl
# CloudFront managed policy IDs:
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"   # CORS-S3Origin
```


## 書かないコメント（アンチパターン）

### NG: コードから自明な説明

```hcl
# ❌ Lambda関数を定義
resource "aws_lambda_function" "web_app" {
  # ...
}

# ❌ ロールの名前を指定
name = "web-app-role"
```

→ 書かない。

### NG: 型名・リソース種別の繰り返し

```hcl
# ❌ DynamoDBテーブル
resource "aws_dynamodb_table" "article" { ... }
```

→ 書かない。

### NG: 「何をするか」の説明

```hcl
# ❌ GSIを1つ追加する
global_secondary_index { ... }
```

→ 「なぜ」の説明がないなら書かない。

## コードスタイル

### インデント・整形

- `terraform fmt` 準拠
- 引数の等号は揃える（terraform fmt がやってくれる）
- ネストが深い jsonencode() 内部も基本fmt任せでOK

### ブロック内の並び順

リソース本体で慣習的に使う並び順：

1. 識別子系（`name`, `function_name`, `domain` など）
2. 基本設定（`runtime`, `billing_mode` など）
3. 構造定義（`environment`, `global_secondary_index`, `logging_config` など）
4. 付随ブロック（`tracing_config`, `tags` など）

（これはあくまで目安。`terraform fmt` の並びは保存しつつ、新規作成時はこの順で書くと読みやすい）

### 空行の入れ方

論理的なブロックの境目に空行を1つ入れる。

```hcl
resource "aws_lambda_function" "web_app" {
  function_name = "web-app"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]

  environment {
    variables = {
      FOO = "bar"
    }
  }

  logging_config {
    log_format = "JSON"
  }
}
```

## アンチパターン（まとめ）

### NG: 英語コメントを混ぜる理由がない

```hcl
# ❌ Create Lambda function for web app
```

→ 日本語に統一。

### NG: コメントを「コードの横に貼ったラベル」にする

```hcl
# ❌
resource "aws_lambda_function" "web_app" {
  runtime = "nodejs22.x"   # Node.js 22
  memory_size = 1769       # Memory size in MB
}
```

→ コードから自明。書かない。

### NG: TODOに理由を書かない

```hcl
# ❌
# TODO: あとで直す
```

→ 「何が理想で、なぜ今できていないか」を書く。
