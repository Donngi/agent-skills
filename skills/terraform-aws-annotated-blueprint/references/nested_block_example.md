# ネストブロック例

## aws_lambda_function のネストブロック記述例（抜粋）

ネストブロックを含むリソースの正しい記述フォーマットを示す。全プロパティをコメントアウトせず記載する。

```hcl
resource "aws_lambda_function" "example" {
  #-------------------------------------------------------------
  # 基本設定
  #-------------------------------------------------------------

  # function_name (Required)
  # 設定内容: Lambda関数の一意な名前を指定します。
  # 設定可能な値: 最大64文字。英数字、ハイフン、アンダースコアが使用可能
  function_name = "example-lambda-function"

  # role (Required)
  # 設定内容: Lambda関数の実行ロールのARNを指定します。
  # 設定可能な値: 有効なIAMロールARN
  role = "arn:aws:iam::123456789012:role/lambda-execution-role"

  #-------------------------------------------------------------
  # ランタイム設定
  #-------------------------------------------------------------

  # runtime (Optional)
  # 設定内容: 関数のランタイム識別子を指定します。
  # 設定可能な値: nodejs20.x, python3.12, java21, dotnet8 等
  # 省略時: package_type = "Image" の場合は不要
  runtime = "nodejs20.x"

  # handler (Optional)
  # 設定内容: 関数のエントリーポイントを指定します。
  # 設定可能な値: <ファイル名>.<関数名> 形式の文字列
  # 省略時: package_type = "Image" の場合は不要
  handler = "index.handler"

  #-------------------------------------------------------------
  # VPC設定
  #-------------------------------------------------------------

  # vpc_config (Optional)
  # 設定内容: Lambda関数をVPC内のリソースに接続する場合の設定ブロックです。
  # 関連機能: Lambda VPCアクセス
  #   Lambda関数をVPC内のリソース（RDS、ElastiCache等）に接続可能。
  #   - https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html
  vpc_config {

    # subnet_ids (Required)
    # 設定内容: 関数に関連付けるサブネットIDのリストを指定します。
    # 設定可能な値: 有効なサブネットIDのリスト
    # 注意: 高可用性のため複数AZのサブネットを指定推奨
    subnet_ids = ["subnet-12345678", "subnet-87654321"]

    # security_group_ids (Required)
    # 設定内容: 関数に関連付けるセキュリティグループIDのリストを指定します。
    # 設定可能な値: 有効なセキュリティグループIDのリスト
    security_group_ids = ["sg-12345678"]

    # ipv6_allowed_for_dual_stack (Optional)
    # 設定内容: デュアルスタックサブネットでIPv6アウトバウンドトラフィックを許可するかを指定します。
    # 設定可能な値:
    #   - true: IPv6トラフィックを許可
    #   - false: IPv6トラフィックを拒否
    # 省略時: false
    ipv6_allowed_for_dual_stack = false
  }

  #-------------------------------------------------------------
  # 環境変数設定
  #-------------------------------------------------------------

  # environment (Optional)
  # 設定内容: 関数実行時に利用可能な環境変数の設定ブロックです。
  environment {

    # variables (Optional)
    # 設定内容: 環境変数のキーと値のマップを指定します。
    # 設定可能な値: 文字列のキーバリューマップ
    variables = {
      ENVIRONMENT = "production"
      LOG_LEVEL   = "info"
    }
  }

  #-------------------------------------------------------------
  # ロギング設定
  #-------------------------------------------------------------

  # logging_config (Optional)
  # 設定内容: 高度なロギングの設定ブロックです。
  # 関連機能: Lambda 高度なロギング制御
  #   JSON構造化ログやログレベルフィルタリングが可能。
  #   - https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html
  logging_config {

    # log_format (Required)
    # 設定内容: ログのフォーマットを指定します。
    # 設定可能な値:
    #   - "Text": テキスト形式
    #   - "JSON": JSON構造化形式
    log_format = "JSON"

    # application_log_level (Optional)
    # 設定内容: アプリケーションログの詳細レベルを指定します。
    # 設定可能な値: "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"
    # 省略時: log_formatが"JSON"の場合のみ有効
    application_log_level = "INFO"

    # system_log_level (Optional)
    # 設定内容: Lambdaプラットフォームログの詳細レベルを指定します。
    # 設定可能な値: "DEBUG", "INFO", "WARN"
    # 省略時: log_formatが"JSON"の場合のみ有効
    system_log_level = "WARN"

    # log_group (Optional)
    # 設定内容: ログの送信先CloudWatch Logsグループを指定します。
    # 設定可能な値: 有効なCloudWatch Logsグループ名
    # 省略時: 自動的に /aws/lambda/<function_name> が作成されます
    log_group = "/aws/lambda/example-function"
  }

  #-------------------------------------------------------------
  # トレーシング設定
  #-------------------------------------------------------------

  # tracing_config (Optional)
  # 設定内容: AWS X-Rayトレーシングの設定ブロックです。
  # 関連機能: Lambda X-Rayトレーシング
  #   分散アプリケーションのリクエストフローを可視化。
  #   - https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html
  tracing_config {

    # mode (Required)
    # 設定内容: トレーシングモードを指定します。
    # 設定可能な値:
    #   - "Active": X-Rayトレーシングを有効化
    #   - "PassThrough": 上流のトレーシング決定に従う
    mode = "Active"
  }

  #-------------------------------------------------------------
  # デッドレターキュー設定
  #-------------------------------------------------------------

  # dead_letter_config (Optional)
  # 設定内容: 非同期呼び出し失敗時の通知先の設定ブロックです。
  # 関連機能: Lambda デッドレターキュー
  #   非同期呼び出しが全リトライ後に失敗した場合にメッセージをSNS/SQSに送信。
  dead_letter_config {

    # target_arn (Required)
    # 設定内容: 通知先のSNSトピックまたはSQSキューのARNを指定します。
    # 設定可能な値: 有効なSNSトピックARNまたはSQSキューARN
    target_arn = "arn:aws:sqs:us-east-1:123456789012:lambda-dlq"
  }

  #-------------------------------------------------------------
  # タグ設定
  #-------------------------------------------------------------

  # tags (Optional)
  # 設定内容: リソースに割り当てるタグのマップを指定します。
  # 設定可能な値: キーと値のペアのマップ
  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

#---------------------------------------------------------------
# Attributes Reference (読み取り専用属性)
#---------------------------------------------------------------
# このリソースは以下の属性をエクスポートします:
#
# - arn: Lambda関数のARN
# - invoke_arn: API Gateway統合用の呼び出しARN
# - qualified_arn: バージョン番号付きARN
# - version: 最新公開バージョン
# - last_modified: 最終変更日時
# - source_code_size: .zipファイルサイズ（バイト）
# - tags_all: 継承タグを含む全タグマップ
#---------------------------------------------------------------
```

## ネストブロックのフォーマットルール

1. **ブロックヘッダーもカテゴリ区切り `#-----` を使用** — `====` や `----` は禁止
2. **ブロック内の各属性も `設定内容:` / `設定可能な値:` / `省略時:` プレフィックスを使用**
3. **全プロパティをコメントアウトせず記載** — 値は代表的なサンプル値を設定
4. **ブロックの説明コメントにも `設定内容:` を付与** — `# vpc_config (Optional)` の次行
