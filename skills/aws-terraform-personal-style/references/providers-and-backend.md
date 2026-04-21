# Providers and Backend

Terraform provider と backend 周りの規約。

## env配下は4点構成

env（`terraform/envs/<env>/`）は以下の4ファイルに限定する。

- `main.tf` — module呼び出し
- `providers.tf` — provider定義
- `versions.tf` — required_version / required_providers
- `backend.tf` — backend "s3" 定義（ローカル環境を除く）

## versions.tf

env と module の**両方で必須**。Terraformとprovider versionを明示する。

### env配下

```hcl
# envs/<env>/versions.tf
terraform {
  required_version = ">= 1.9.8"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.30.0"
    }
  }
}
```

### module配下

モジュールは単体で利用可能であるべきなので、**module側にも `versions.tf` を必ず置く**。moduleが動作保証する provider 範囲を明示する。

```hcl
# modules/<module_name>/versions.tf
terraform {
  required_version = ">= 1.9.8"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.30.0"
    }
  }
}
```

`configuration_aliases` が必要なmoduleの場合は、この `versions.tf` の `required_providers` 内に追加する（別ファイル `providers.tf` には分離しない。Terraformは `required_providers` を1モジュール内で複数ブロックに分散できないため）。具体例は下記「モジュール側で aliased provider を受け取る」を参照。

## providers.tf

### メインenv（例: prod）

```hcl
# envs/prod/providers.tf
provider "aws" {
  region = "ap-northeast-1"
}

provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}
```

**2つ以上のproviderが必要なとき**（例: CloudFront + Lambda@Edge のため `us-east-1` が必要）、`alias` で追加providerを定義する。aliasを使わない場合は1つだけで良い。

### ローカル環境（LocalStack等）

LocalStackを使う場合は別の `providers.tf` を作って、endpoints と skip_* を設定する。

```hcl
# envs/local/providers.tf
provider "aws" {
  region                      = "ap-northeast-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    dynamodb = "http://localhost:4566"
    # 必要なサービスだけ追加
  }
}
```

### モジュール側で aliased provider を受け取る

モジュールが aliased provider を使う場合（例: Lambda@Edge を `us-east-1` で作る）、**モジュールの `versions.tf` の `required_providers` に `configuration_aliases` を追加**する（別ファイルにしない。Terraformは1モジュール内で `required_providers` を複数の `terraform` ブロックに分散させられないため）。

```hcl
# modules/<component>/versions.tf
terraform {
  required_version = ">= 1.9.8"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.30.0"
      configuration_aliases = [aws.us-east-1]
    }
  }
}
```

そしてモジュール内でそのproviderを使うリソースに `provider = aws.us-east-1` を明示する。

```hcl
resource "aws_lambda_function" "edge" {
  provider = aws.us-east-1
  # ...
}
```

env側から呼ぶときは `providers` ブロックでマッピング。

```hcl
# envs/prod/main.tf
module "web_app" {
  source = "../../modules/web_app"

  # 他の変数 ...

  providers = {
    aws.us-east-1 = aws.us-east-1
  }
}
```

## backend.tf

### S3 + S3 native state locking

**DynamoDB lock は使わない**。Terraform 1.10 以降で S3 backend に組み込まれた **S3 native state locking**（`use_lockfile = true`）を使う（Terraform Core の機能で、AWS providerバージョンには非依存）。

```hcl
# envs/<env>/backend.tf
terraform {
  backend "s3" {
    bucket       = "<backend_bucket_name>"
    key          = "terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
```

- `use_lockfile = true` で S3 native state locking が有効になる
- 別途 DynamoDB テーブルを用意する必要なし
- backend bucket 自体は Terraform管理外（手動作成 or 別のbootstrap Terraformで作成）

### backend は変数化しない

backend config は静的な literal で書く。variable や locals で動的にしない（Terraform仕様上、backendブロックは変数展開できない）。

複数env共通の値があっても、各 env の `backend.tf` に同じ値をベタ書きする。

### ローカル環境にbackend.tfは置かない

LocalStack用のenvはstateをローカルに置けば良いので `backend.tf` を作らない（デフォルトの local backend で十分）。

## サンプル: 典型的な env の4ファイル

```
envs/prod/
├── main.tf         # モジュール呼び出し
├── providers.tf    # provider定義（メイン + us-east-1 alias）
├── versions.tf     # required_version + required_providers
└── backend.tf      # S3 backend + native lockfile
```

## アンチパターン

### NG: backend の lock に DynamoDB を使う

```hcl
# ❌
terraform {
  backend "s3" {
    bucket         = "..."
    key            = "terraform.tfstate"
    region         = "..."
    dynamodb_table = "terraform-locks"   # DynamoDBは使わない
  }
}
```

→ `use_lockfile = true` でS3 native lockingを使う。

### NG: backend をvariableで動的に指定しようとする

```hcl
# ❌ Terraformは backend block で変数展開できない
terraform {
  backend "s3" {
    bucket = var.backend_bucket
  }
}
```

→ literal でベタ書きするか、`terraform init -backend-config=...` で渡す。このスタイルでは **ベタ書きを選ぶ**。

### NG: env配下に無関係なファイルを増やす

```
envs/prod/
├── main.tf
├── providers.tf
├── versions.tf
├── backend.tf
├── locals.tf        # ❌ env側にlocalsは原則不要（moduleに寄せる）
└── iam.tf           # ❌ envにIAMリソース直書きしない
```

→ env は `module` 呼び出しと provider/backend設定に限定する。

### NG: moduleにprovider block本体を書く

```hcl
# ❌ modules/<component>/providers.tf
provider "aws" {        # module内で provider ブロックを定義してはいけない
  region = "us-east-1"
}
```

→ module は `configuration_aliases` で宣言するだけ。実体は env 側に置く。

### NG: module の versions.tf を省略

```
modules/<component>/
├── variables.tf
├── outputs.tf
└── lambda.tf
# ❌ versions.tf が無い
```

→ module側にも `versions.tf` を必ず置く（`required_version` + `required_providers`）。module単体での動作保証範囲を明示する。
