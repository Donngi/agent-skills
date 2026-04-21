---
name: aws-terraform-personal-style
description: DonngiのAWS Terraform個人スタイルで新規コードを書く・既存コードをレビューする。envs/modules構成、meta objectによるmodule合成、IAM 3リソース1ファイル、Sid必須のinline policy、S3 native state locking、日本語コメントなどの規約に従う。Terraformで `.tf` ファイルを新規作成・編集する時に使用する。
---

# AWS Terraform Personal Style (Donngi)

DonngiがAWS Terraformを書くときのスタイルを再現する。プロジェクト固有の命名や構成に依存せず、**スタイル（構造と書き方）** を統一する。

## いつ使うか

- 新規にAWS Terraformコードを書く時（特に `envs/` + `modules/` 構成）
- 既存のTerraformコードを個人スタイルに寄せてレビュー・リファクタリングする時

## 最優先の原則（まずこれを守る）

1. **ファイルは1リソース種別ごとに分割する**
   - `<service>_<resource>.tf` 形式（例: `cloudfront_distribution.tf`, `dynamodb_article.tf`）
   - 詳細: references/file-organization.md

2. **IAMの `aws_iam_role` + `aws_iam_policy` + `aws_iam_role_policy_attachment` は同一ファイルに3点セットで書く**
   - ファイル名は `iam_<component>.tf`
   - 詳細: references/iam.md

3. **同一リソースから複数のmetadataを渡すときだけ `object` に集約する**
   - 同一リソースの `name` と `arn` のように密結合したmetaは `xxx_meta = { name, arn, ... }` にバンドル
   - 単一値や無関係な値まで無理に集約しない（primitive型でOK）
   - 詳細: references/module-composition.md

4. **IAM policyは `Sid` 必須、Actionはワイルドカード禁止**
   - Sidは `Allow<What><Action>` のような説明的な名前
   - 1 Sid = 1 リソース/用途グループで分割
   - 詳細: references/iam.md

5. **コメントは日本語で、「なぜ」を書く**
   - AWS公式docへのリンクも適宜貼る
   - 詳細: references/comments-and-style.md

6. **env配下は `main.tf` / `providers.tf` / `versions.tf` / `backend.tf` の4点構成**
   - backend は S3 + S3 native state locking を使用
   - 詳細: references/providers-and-backend.md

## 詳細リファレンス（タスクに応じて読む）

| リファレンス | 読むべき場面 |
|---|---|
| references/file-organization.md | 新規モジュール作成時、ファイル分割の判断時 |
| references/module-composition.md | envs/から複数modulesを呼ぶとき、module間でデータを渡すとき |
| references/naming.md | resource local name / AWS name / role名 を決めるとき |
| references/variables-and-locals.md | 新規変数を追加するとき、localsを使うか迷ったとき、`validation` / `sensitive` / `nullable` / `ephemeral` を使うか判断するとき |
| references/iam.md | IAM role/policy を作るとき（必読） |
| references/providers-and-backend.md | 新規env作成時、aliased provider や LocalStack 対応時 |
| references/comments-and-style.md | コメントを書くとき、定数やmanaged policyを参照するとき |

## ワークフロー

1. 該当する references/*.md を読む（特に IAM は必ず読む）
2. 既存の `envs/<env>/main.tf` と `modules/*/` の構造に合わせて配線する
3. 新規モジュールは以下を分離配置する：
   - `variables.tf`（入力変数 — **変数が無くても空ファイルを必ず置く**）
   - `outputs.tf`（出力 — **出力が無くても空ファイルを必ず置く**）
   - `versions.tf`（**module側にも必須**。`required_version` + `required_providers`、`configuration_aliases` も必要ならここに書く）
   - 本体 `.tf` ファイル群（リソース種別ごとに分割）
4. IAMがあるコンポーネントは `iam_<component>.tf` で3点セットを1ファイルにまとめる
5. モジュールの出力は関連attributeを `object` にバンドルしてexportする
