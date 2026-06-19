---
name: syncing-aidlc-workflows
description: AWSの aidlc-workflows（AI-DLC ワークフロー, awslabs/aidlc-workflows の v2 ブランチ）の成果物を、作業中の任意のプロジェクトに取り込み、後から差分アップデートするスキル。取り込み時はハーネス（Claude Code / Kiro CLI / Codex CLI）を選んでアセットを配置し、3-way マージでローカルの変更を保持したまま上流の新版を反映する。さらに取り込んだ Markdown の日本語訳を参考物として併せて保存する。「aidlc を取り込んで」「aidlc workflow を入れて」「aidlc を最新に更新して」「上流で何が変わったか差分を見せて」「自分の変更を残したまま aidlc を更新」などのリクエストで必ず使用すること。AI-DLC / aidlc / aidlc-workflows の導入・更新・差分確認はこのスキルが担当する。
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# syncing-aidlc-workflows

AWS の `awslabs/aidlc-workflows`（v2 ブランチ）の成果物を任意のプロジェクトに取り込み、
**ローカル変更を消さずに**差分アップデートする。取り込むハーネスは **Claude Code** /
**Kiro CLI** / **Codex CLI** から選べる。取り込んだ Markdown の日本語訳も併せて保存する。

決定論的な処理（取得・3-way マージ・整合性検証）は `lib/*.sh` が担い、Claude は
**対話と判断（ツール選択・衝突解決の促し・日本語訳の生成）**を担う。

## 前提条件

- **必須**: `git`, `jq`（差分 update の 3-way マージは `git merge-file` を使うため git 必須）
- **任意**: `curl`, `tar`（`git` が無い環境での上流取得フォールバック。ただし fallback で動くのは
  import / diff のみで、update（merge）は git が要る。git ログ補助も無効になる）

> 上流 v2 は全ハーネスの成果物を**ビルド済みでコミット**しているため、取り込みに `node` 等の
> ビルドツールは不要（旧 kiro のような一時 clone 内ビルドは廃止された）。

`lib/` スクリプトは本 SKILL.md と同じ階層にある。以下では本スキルのディレクトリを `${SKILL}` と表記する
（実体は `.claude/skills/syncing-aidlc-workflows` 等、インストール先により異なる。実行前に `Glob` で
`**/syncing-aidlc-workflows/lib/aidlc_common.sh` を探して絶対パスを確定すること）。

ターゲット（取り込み先プロジェクト）のルートを `${PROJECT}` と表記する。指定が無ければカレントの
git リポジトリルートを使う。

## 重要な原則

- **dist が成果物。ビルドしない。** v2 ブランチは全ハーネスの成果物を `dist/<harness>/...` に
  ビルド済みでコミットしている（claude → `dist/claude/.claude/`、Kiro CLI → `dist/kiro/.kiro/`、
  Codex CLI → `dist/codex/`）。スクリプトは使い捨ての一時 clone からこの dist を取り込むだけで、
  **ビルドは一切走らせない。**
- **aidlc の動作に不要な内容は取り込まない（取得 dist を正規化）。** claude の `settings.json` は
  aidlc の動作に必要な `hooks` 登録だけを残し、環境固有・グローバル設定（`env` の Bedrock/AWS_REGION/
  モデル指定、`model`、`effortLevel`、`statusLine`、`permissions`、`companyAnnouncements`）と
  `settings.local.json.example` は除去する。これらはユーザーの Claude Code 環境を上書きしてしまうため。
  codex は dist 直下の `AGENTS.md` を取り込み対象外として除去する（`.codex/` と `.agents/` のみ取り込む）。
  正規化は取得した一時 clone 上で行い、import/diff/merge すべてが同じ正規化済み dist を base/theirs の
  元にするので 3-way マージは一貫する（`lib/aidlc_common.sh` の `aidlc_normalize_dist`）。
- **base が 3-way マージの base。改変厳禁。** `${PROJECT}/.aidlc-sync/base/` は「前回取り込んだ
  無改変版」。ここが base となるため、手で触らない。
- **update は merge → finalize の2フェーズ。** 衝突が残っている間は base を進めない。これにより
  中断・再開・ロールバックが安全に成立する。
- **reference-ja はマージ対象外の参考物。** 日本語訳は最新上流の参考であり、3-way マージには関与しない。
- **参考docs も翻訳対象（インストールはしない）。** 上流 repo 直下の `docs/`（AI-DLC のガイド/リファレンス。
  dist_root の外にあるハーネス非依存の Markdown）は、install 先には配置せず `.aidlc-sync/base/docs/` に
  スナップショットして翻訳のみ行う。3-way マージには関与せず、update 時は base 内の docs を上流最新で
  まるごと差し替える。manifest では `files[]`（installed 資産）とは別の `docFiles[]` で追跡する。

## 動作上の禁止事項

- `.aidlc-sync/base/` および `.aidlc-sync/incoming/` の手編集
- dirty なターゲットでユーザー同意なく `--force` マージを強行すること
- ワークフローに無い中間ファイルの生成

## ワークフロー

最初に必ず状況を把握する。`manifest.json` の有無で「初回 import」か「差分 update」かが決まる。

```bash
bash "${SKILL}/lib/aidlc_status.sh" --project-root "${PROJECT}"
```

`manifest が見つかりません` → **A. 初回 import** へ。そうでなければ **B. 差分 update** へ。
`保留中update ⚠️ あり` と出たら、先に B の finalize か abort を済ませる。

### A. 初回 import

1. **ハーネスを確認する。** 取り込むハーネスをユーザーに確認する。`--tool` は次のいずれか。
   配置先 `--install-path` は未指定ならツール既定。
   - `claude`（Claude Code）: `dist/claude/.claude/` を `.claude/` へ。`settings.json` は hooks のみに正規化。
   - `kiro`（Kiro CLI）: `dist/kiro/.kiro/` を `.kiro/` へ。
   - `codex`（Codex CLI）: `dist/codex/` を **project root** へ（installPath=`.`）。`.codex/` と `.agents/`
     を配置し、`AGENTS.md` は取り込まない（必要なら上流の `dist/codex/AGENTS.md` を手動でコピーする旨を案内）。
   - 注意: `claude`/`kiro` は既定配置先（`.claude`/`.kiro`）が既存のプロジェクトでは初回 import が停止する
     （クリーンな配置先が前提）。既存ディレクトリがある場合はユーザーと配置先を相談する。
   - 注意: 上流から **Kiro IDE** は対象外（本スキルは Kiro CLI を扱う）。

2. **dry-run で予定を見せる**（任意だが推奨）:
   ```bash
   bash "${SKILL}/lib/aidlc_import.sh" --project-root "${PROJECT}" --tool claude --dry-run
   ```

3. **import 実行**:
   ```bash
   bash "${SKILL}/lib/aidlc_import.sh" --project-root "${PROJECT}" --tool claude   # または --tool kiro / --tool codex
   ```
   これで `${PROJECT}/<installPath>/`（実利用。claude→`.claude/`、kiro→`.kiro/`、codex→`.codex/`+`.agents/`）と
   `${PROJECT}/.aidlc-sync/`（manifest + base）が作られる。

4. **日本語訳を生成する**（→ C へ）。import 直後は全 md が翻訳対象。

5. ユーザーに「`.aidlc-sync/` をコミットすると base をチーム共有でき再現性が出る」と伝える。

### B. 差分 update（diff → merge → 衝突解決 → finalize）

1. **上流差分を見せる。** 何が変わるかを先に提示する:
   ```bash
   bash "${SKILL}/lib/aidlc_diff.sh" --project-root "${PROJECT}"
   ```
   `上流に変更はありません` なら最新。ここで終了。

2. **dirty を解消させる。** ターゲットが git 管理下なら、`<installPath>`（例 `.kiro` / `.claude`）や
   `.aidlc-sync` に未コミット変更があると merge は停止する。コミットか stash を促す（ロールバックの
   安全網を確保するため）。

3. **merge をプレビュー → 実行**:
   ```bash
   bash "${SKILL}/lib/aidlc_merge.sh" --project-root "${PROJECT}" --dry-run   # 件数確認
   bash "${SKILL}/lib/aidlc_merge.sh" --project-root "${PROJECT}"             # 実行
   ```
   自動マージできる箇所は反映済み。**衝突一覧**が出たら、各ファイルの `<<<<<<<` マーカーを
   ユーザーと解消する（詳細は [references/conflict-resolution.md](references/conflict-resolution.md)）。
   この時点では base も manifest の確定情報も未更新。やり直すなら
   `aidlc_merge.sh --project-root "${PROJECT}" --abort`。

4. **finalize で確定**:
   ```bash
   bash "${SKILL}/lib/aidlc_finalize.sh" --project-root "${PROJECT}"
   ```
   install 先にマーカーが残っていれば停止する。全解消後に base を新上流へ入替え、manifest を更新する。
   削除衝突やバイナリ衝突が記録されていた場合は、対処を確認のうえ `--accept` を付けて再実行する。

5. **日本語訳を更新する**（→ C へ）。原文が変わった md だけが対象。

### C. 日本語訳の生成・更新

翻訳が必要な md の一覧を取得する（`translatedSha256` が未設定 or 原文と不一致のもの）:

```bash
bash "${SKILL}/lib/aidlc_status.sh" --project-root "${PROJECT}" --translation-todo
```

この一覧は **install 資産（`files[]`）と 参考docs（`docFiles[]`＝上流 `docs/` 由来）の両方**を含む。
docs の md は `docs/...` のパスで出る。**ここに出た md は 1 つ残らず翻訳対象**であり、件数が多くても
（claude では install 資産＋docs で計 200 件超になりうる）勝手に一部だけで打ち切らないこと。

各対象 md について:

1. 原文を読む: `${PROJECT}/.aidlc-sync/base/<相対パス>`（= 最新上流の無改変版。install 先のローカル
   変更込みファイルではなく、必ず base を原文とする）。docs も同じく `base/docs/...` を原文とする。
2. 日本語訳を `${PROJECT}/.aidlc-sync/reference-ja/<相対パス>` に同じ相対構造で `Write` する。
   翻訳方針・用語統一は [references/translation-guide.md](references/translation-guide.md) に従う。
3. 翻訳済みを記録する:
   ```bash
   bash "${SKILL}/lib/aidlc_status.sh" --project-root "${PROJECT}" --mark-translated "<相対パス>"
   ```

**完了ゲート: `--translation-todo` の出力が空になるまで繰り返す。** 各 md を訳すたびに即
`--mark-translated` で記録すれば進捗は中断・再開しても失われない。多数あって一度に終わらない場合も、
途中で「完了」と報告せず、`--translation-todo` が 0 件になるまで翻訳を続ける（残ったまま終えると
次回も未翻訳と判定され続ける）。上流で削除された md の訳は `reference-ja/` から削除してよい。

## スクリプト一覧（`lib/`）

| スクリプト | 役割 |
|---|---|
| `aidlc_common.sh` | 共通ライブラリ（source 専用。単体実行しない） |
| `aidlc_fetch.sh` | 上流取得の薄い CLI（通常は import/merge が内部で取得するため直接は使わない） |
| `aidlc_import.sh` | 初回 import |
| `aidlc_diff.sh` | 上流差分（前回取り込み版 → 新版）の提示 |
| `aidlc_merge.sh` | update①: 3-way マージ / `--dry-run` / `--abort` |
| `aidlc_finalize.sh` | update②: 確定（マーカー検証 → base 入替 → manifest 更新） |
| `aidlc_status.sh` | 状況診断 / `--local-changes` / `--translation-todo` / `--mark-translated` |

## 参照ファイル

- [references/architecture.md](references/architecture.md) — メタデータ設計・base・2フェーズの不変条件
- [references/manifest-schema.md](references/manifest-schema.md) — `manifest.json` のスキーマ
- [references/conflict-resolution.md](references/conflict-resolution.md) — 衝突マーカーの読み方と解消手順
- [references/translation-guide.md](references/translation-guide.md) — 日本語訳の方針・用語統一
- [references/troubleshooting.md](references/troubleshooting.md) — 失敗モードと復旧手順
