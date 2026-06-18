---
name: generating-aidlc-claude-config
description: syncing-aidlc-workflows が取り込んだ Kiro 形式の AI-DLC（AI-DLC ワークフロー, awslabs/aidlc-workflows v2）成果物から、Claude Code 向けの設定一式（.claude/skills, .claude/agents, .claude/settings.json のフック）を決定論的に生成するスキル。Kiro 用しか配布されていない AI-DLC を Claude Code で動かせるようにする。「aidlc を claude code 用に変換して」「kiro の aidlc から claude 設定を生成」「aidlc を claude code で使えるようにして」「.kiro の aidlc を .claude に変換」「aidlc の claude code 版を作って」などのリクエストで必ず使用すること。Kiro→Claude Code の AI-DLC 設定変換・生成はこのスキルが担当する。上流の取得・取り込み・更新自体は syncing-aidlc-workflows の担当で、本スキルはその出力（.kiro/）を入力に取る。
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# generating-aidlc-claude-config

プロジェクトに取り込み済みの **Kiro 形式 AI-DLC 成果物（`.kiro/`）** を入力に、
**Claude Code 形式の設定（`.claude/`）** を生成する。上流 `awslabs/aidlc-workflows` v2 は
Kiro 用ビルドしか配布していないため、それを Claude Code で動かせる形へ変換するのが役割。

決定論的な変換（再配置・パス書換え・JSON→MD・hook→settings マージ）は
`lib/aidlc_to_claude.sh` が担い、Claude は **状況判断・確認・差分提示**を担う。

## 役割分担と前提

- **入力**: `${PROJECT}/.kiro/`（`syncing-aidlc-workflows` が配置したライブの成果物）。
  取り込みや上流更新そのものは syncing スキルの担当。本スキルは取り込み済みの `.kiro/` を読む。
- **出力**: `${PROJECT}/.claude/`（`skills/`, `agents/`, `aidlc-common/`, `settings.json`）。
- **必須**: `jq`（agents/hook の JSON 処理と settings.json の非破壊マージに使う）。`rsync` があれば使い、無ければ `cp -R` にフォールバック。

このスキルのディレクトリを `${SKILL}` と表記する（実体は `.claude/skills/generating-aidlc-claude-config`
等、インストール先で異なる。実行前に `Glob` で `**/generating-aidlc-claude-config/lib/aidlc_to_claude.sh`
を探して絶対パスを確定すること）。取り込み先プロジェクトのルートを `${PROJECT}` と表記し、
指定が無ければカレントの git リポジトリルートを使う。

## なぜ「再配置中心」で済むのか

AI-DLC のコンテンツはフレームワークパスを **install root 相対**（`skills/...`,
`aidlc-common/...`）で書くよう設計されており、orchestrator-protocol が
「install root は Kiro なら `.kiro/`、Claude なら `.claude/`」と明記している。
したがって変換の大半は `.kiro/` の中身を `.claude/` に**置くだけ**で参照が成立する。
Kiro 固有フォーマットに依存して書換えが要るのは次の3点だけ:

1. `agents/*.json` → `.claude/agents/*.md`（Claude Code のサブエージェント形式へ／ツール名写像）
2. `hooks/*.kiro.hook` → `.claude/settings.json` の `PostToolUse` フック（＋ reminder スクリプト）
3. `aidlc-common/**/*.js` 内のハードコード `.kiro` パス → `.claude`

詳細な対応表と判断根拠は [references/conversion-rules.md](references/conversion-rules.md) を参照。

## ワークフロー

### 1. 入力を確認する

`.kiro/` が AI-DLC の成果物として揃っているかを確かめる。

```bash
ls "${PROJECT}/.kiro/skills" "${PROJECT}/.kiro/agents" "${PROJECT}/.kiro/aidlc-common" 2>&1
```

`.kiro/` が無い、または `skills/`・`aidlc-common/` が欠けている場合は、**先に
`syncing-aidlc-workflows` で取り込むよう促す**（本スキルは取り込みはしない）。

### 2. dry-run で変換予定を見せる

何が生成・更新されるかを先に提示する（書き込みはしない）。

```bash
bash "${SKILL}/lib/aidlc_to_claude.sh" --project-root "${PROJECT}" --dry-run
```

特に **`.claude/settings.json` へのフック追記**は既存設定に触れるため、dry-run の出力で
「何が追加されるか」をユーザーに見せて合意を取る。既に `.claude/skills` 等がある場合
（再生成）も、上書き対象を dry-run で確認する。

### 3. 変換を実行する

```bash
bash "${SKILL}/lib/aidlc_to_claude.sh" --project-root "${PROJECT}"
```

これで以下が生成される:

- `${PROJECT}/.claude/skills/aidlc-*/` — 各 AI-DLC スキル（無改変コピー）
- `${PROJECT}/.claude/agents/aidlc-*-agent.md` — builder / validator サブエージェント
- `${PROJECT}/.claude/aidlc-common/` — conventions・protocols・scripts（`.js` のパスは書換え済み）
- `${PROJECT}/.claude/settings.json` — `PostToolUse(Task)` フックを**非破壊マージ**

### 4. settings.json の差分を提示する

フックのマージは既存設定を保持しつつ追記する。何が増えたかをユーザーに見せる:

```bash
git -C "${PROJECT}" diff -- .claude/settings.json 2>/dev/null || cat "${PROJECT}/.claude/settings.json"
```

`permissions` や他の `PostToolUse` エントリが保持され、`matcher: "Task"` の AI-DLC フックが
1 件だけ加わっていることを確認する（再実行しても重複しない＝冪等）。

### 5. 結果を伝える

- 生成された `.claude/skills/aidlc-orchestrator` が Claude Code の skill として認識され、
  開発意図（「〜を作って」等）で起動できるようになったこと。
- builder / validator は `.claude/agents/` のサブエージェントとして `Task` で呼ばれること。
- フックがサブエージェント完了後に `process_checker` 実行を促すこと。
- `.claude/` をコミットすればチーム共有・再現できること。

## オプション

| フラグ | 用途 |
|---|---|
| `--dry-run` | 書き込まず変換予定だけ表示 |
| `--no-settings` | settings.json を触らず、追記用スニペットを出力（手動マージしたい場合） |
| `--kiro-root DIR` | 入力元を明示（既定 `${PROJECT}/.kiro`）。`.aidlc-sync/base/` を無改変版の入力にしたい等 |
| `--claude-root DIR` | 出力先を明示（既定 `${PROJECT}/.claude`） |

## 上流更新後の再生成

`syncing-aidlc-workflows` で `.kiro/` を更新したら、本スキルを**再実行するだけ**で
`.claude/` が追従する。変換は冪等なので、settings.json のフックが重複することはない。
ただし `.claude/skills` 等をローカル編集していた場合、再生成で上書きされる点に注意
（その編集は `.kiro/` 側に寄せるか、再生成後に再適用する）。

## 動作上の禁止事項

- `.kiro/` の編集（本スキルは入力を読むだけ。取り込み・更新は syncing スキルの担当）
- `node build.js` の実行(`.kiro/` の dist 成果物をそのまま入力とする)
- settings.json の破壊的上書き（必ず非破壊マージ。手動運用したいなら `--no-settings`）
- 未知のツール名・新フック種別を勝手に推測して写像すること（原文を残し、人間に確認を促す）

## 参照ファイル

- [references/conversion-rules.md](references/conversion-rules.md) — Kiro→Claude Code の対応表・ツール名写像・hook 変換の詳細と根拠
