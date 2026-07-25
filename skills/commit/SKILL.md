---
name: commit
description: コミット規約に沿ったコミットを作成する（変更の分類・分割も自動判断）。ユーザーが「コミットして」「変更をコミット」「/commit」などと言った場合に使用。Conventional Commitsを基本とした規約に従い、適切なtype/scope/subjectを自動生成。複数の論理単位に分割すべき変更は自動判断して複数コミットに分割する。
---

# コミット作成スキル

## 実行フロー

### 0. オーバーレイの読み込み（カスタマイズの差し込み）

このスキルは実行時に**オーバーレイ**（専用拡張子 `.overlay.md` のローカルファイル）を読み込み、端末・プロジェクトごとに挙動を変える。インストール済みスキル本体は編集せず、外部ファイルでカスタマイズするための仕組み。オーバーレイには**2系統**ある。

- **差し替え（予約名）**: `commit-conventions.overlay.md` は commit rule の予約名。存在すれば既定の [references/commit-conventions.md](references/commit-conventions.md) の**代わり**に、それを commit rule として読む（完全置換）。
- **追加（予約名以外）**: `commit-conventions.overlay.md` 以外の `*.overlay.md` は**必ず追加**で読み込み、commit rule に重ねる（複数可・append）。

解決の決定論的処理は `lib/load-overlays.sh` が担う（`$HOME` とプロジェクト git root の `.agent-skills/commit/` を探索。低優先→高優先＝グローバル→プロジェクト、両方あればプロジェクト優先）。**本スキルのディレクトリを `${SKILL}` と表記**する（本 SKILL.md と同階層。絶対パスが必要なら `**/commit/lib/load-overlays.sh` を探して確定）。

```bash
bash "${SKILL}/lib/load-overlays.sh"
```

- 出力を commit rule として解釈する。「差し替え」が出力された場合はそれが commit rule の**完全な代替**（既定 `commit-conventions.md` は使わない）。出力されなければ既定を使う。
- 「追加オーバーレイ」は commit rule に append する。矛盾時は追加オーバーレイを優先（プロジェクト > グローバル）。
- `--amend` / `--no-verify` / push を行わない等の安全側の注意事項は上書きしない。
- 何をどう書くかは [references/overlay-guide.md](references/overlay-guide.md) を参照。

### 1. 変更の確認

```bash
git status
git diff
git diff --staged
git log --oneline -15
```

- 変更ファイルと差分を確認
- 最近のコミットスタイルを参照

### 2. 変更の分類と分割判断

以下の場合は**コミットを分割**:

- 異なる機能の変更が混在
- `feat` と `fix` が混在
- 独立してリバート可能な変更が含まれる
- 差分が大きすぎる（300行超が目安）

### 3. コミットメッセージ生成

[references/commit-conventions.md](references/commit-conventions.md) の規約に従ってメッセージを生成。

**Bodyの「なぜ」について**:
- コードの差分や会話の文脈から変更理由が推測できる場合は記述
- 推測できない場合は**ユーザーに確認**（例: 「この変更の背景や理由を教えてください」）
- 単純な変更（typo修正、フォーマット等）はbody省略可

### 4. ユーザー確認

コミットを分割する場合はその理由と分割単位を提示し、確認。
分割の必要がない場合は、確認不要。

### 5. コミット実行

確認後、`git add` と `git commit` を実行。

分割が必要な場合は、各まとまりごとにステージング→コミットを繰り返す。

## 注意事項

- `git commit --amend` は使用しない（明示的な指示がない限り）
- `--no-verify` は使用しない（明示的な指示がない限り）
- プッシュは行わない（明示的な指示がない限り）

## フィードバックの記録（イシュー・改善点のローカル記録）

このスキルは GitHub 未ログインの端末でも使われるため、不具合・改善点をその場で失わないよう**ローカルファイルに記録**する。GitHub Issue 化はしない（後日ユーザーが手動で回収する前提）。

### 記録するタイミング

- ユーザーがこのスキルについて「使いにくい」「バグがある」「こう改善したい」等の不満・要望を述べたとき。
- スキル実行中に問題に当たったとき（入力の矛盾、既知の限界、想定外の失敗など）。**その場でユーザーに一言確認**してから記録する（勝手に大量記録しない）。

### 記録先

- 既定: プロジェクト `<git repo root>/.agent-skills/commit/feedback.md`
- 端末横断の一般的な改善点: グローバル `$HOME/.agent-skills/commit/feedback.md`

### 記録手順

記録先の準備（ディレクトリ作成、feedback を**コミットさせない**ための `.gitignore` 冪等配置、メタデータ取得）は `lib/record-feedback.sh` が担う（`${SKILL}` は本スキルのディレクトリ）。

```bash
bash "${SKILL}/lib/record-feedback.sh"            # プロジェクトに記録
# bash "${SKILL}/lib/record-feedback.sh" --global # 端末横断の一般論はグローバルに記録
```

出力（`FEEDBACK_FILE` / `DATE` / `HOST` / `PROJECT`）を使い、`FEEDBACK_FILE` へエントリを**追記**する（既存エントリは消さない）。エントリ様式は [references/feedback-schema.md](references/feedback-schema.md) に従う。`.gitignore` は `feedback.md` のみを除外し、overlay 系はコミット可能なまま残る。

## スクリプト一覧（`lib/`）

決定論的な処理は `lib/*.sh` が担う（`${SKILL}` は本スキルのディレクトリ）。

- `lib/load-overlays.sh` — オーバーレイを解決し、実効 commit rule（差し替え）と追加オーバーレイを stdout に出力。
- `lib/record-feedback.sh [--global]` — feedback 記録先を準備（ディレクトリ作成・`.gitignore` 冪等配置）し、追記先パスとメタデータを出力。

## 参照ファイル（`references/`）

- `references/commit-conventions.md` — 既定の commit rule。
- `references/overlay-guide.md` — オーバーレイ（差し替え／追加）の書き方。
- `references/feedback-schema.md` — feedback エントリの様式。

