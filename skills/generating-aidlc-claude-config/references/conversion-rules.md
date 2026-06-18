# 変換ルール: Kiro → Claude Code

AI-DLC（`awslabs/aidlc-workflows` v2）の **Kiro 形式成果物**を **Claude Code 形式**へ
変換する際の対応表と判断根拠。決定論的な処理は `lib/aidlc_to_claude.sh` が実装しており、
本書はその「なぜ」と「対応表」を説明する参照物である。

## 大前提: コンテンツの大半は install root 相対で書かれている

AI-DLC のコンテンツ（skills の SKILL.md / validation-spec.md、`aidlc-common/` の
conventions・protocols）は、フレームワークパスを **install root 相対**（`skills/...`,
`aidlc-common/...`）で記述するよう設計されている。orchestrator-protocol にも明記がある:

> All framework paths are relative to the AI-DLC install root: `.kiro/` for Kiro,
> `.claude/` for Claude, etc.

したがって変換の本質は **`.kiro/` の中身を `.claude/` に再配置すること**であり、
Kiro 固有フォーマットに依存して書換えが要るのは下記の限られた箇所だけである。

## 対応表

| Kiro 側 | Claude Code 側 | 変換内容 |
|---|---|---|
| `.kiro/skills/<name>/`（SKILL.md, validation-spec.md, scripts/, CATALOGUE.md） | `.claude/skills/<name>/` | **無改変コピー**。frontmatter の `name`/`description` は両者共通。`metadata:` ブロックは orchestrator が読むので保持する。 |
| `.kiro/aidlc-common/`（conventions, protocols, scripts） | `.claude/aidlc-common/` | コピー後、**`.js` 内のハードコード `.kiro` パスのみ** `.claude` へ書換え。 |
| `.kiro/agents/*.json` | `.claude/agents/*.md` | **JSON → Markdown**。後述のツール名写像を適用。 |
| `.kiro/hooks/*.kiro.hook` | `.claude/settings.json`（＋ reminder スクリプト） | **PostToolUse フックへ変換**。後述。 |

## 1. skills/ — 無改変コピー

Kiro と Claude Code の `SKILL.md` は frontmatter（`name`, `description`）も本文も互換。
`description: |` の複数行ブロックも両者で有効。Kiro 独自の `metadata:`（phase / stage /
human-clarification などのフラグ）は **Claude Code の skill ローダは無視するが、
orchestrator-protocol が「read skill flags from SKILL.md frontmatter」で参照する**ため、
削除せず温存する。`validation-spec.md` や `scripts/` も AI-DLC ランタイムの一部としてそのまま運ぶ。

## 2. aidlc-common/ — コピー＋コード内パス書換え

Markdown（conventions, protocols）は install root 相対で書かれているため無改変でよい。
唯一の例外が **`aidlc-process-checker.js`** にあるコード上のリテラル:

```js
const toolsDir = path.join(".kiro", "skills", skillFolder, "scripts");  // → ".claude"
const intentRoot = path.join(".kiro", ...);                            // → ".claude"
```

これらはプロジェクトルートからの相対実行を前提にした実パスなので `.claude` へ書換える。
スクリプトは `*.js` に限定して `".kiro"` / `.kiro/` を置換する（`.md` の説明文中の `.kiro`
言及は触らない — 規約の説明として正しいまま）。

## 3. agents/*.json → .claude/agents/*.md

Kiro のエージェント定義（JSON）と Claude Code のサブエージェント定義（Markdown + frontmatter）
の対応:

**入力（Kiro JSON）:**
```json
{ "name": "...", "description": "...", "prompt": "...", "tools": ["read","write","shell"] }
```

**出力（Claude Code Markdown）:**
```markdown
---
name: <name>
description: <description>
tools: <写像後のツール, カンマ区切り>
---

<prompt>
```

### ツール名の写像

| Kiro | Claude Code | 備考 |
|---|---|---|
| `read` | `Read` | |
| `write` | `Write, Edit` | Kiro の write は新規作成と編集を兼ねる。Claude Code は Write（上書き）と Edit（部分編集）が分かれるため両方付与。 |
| `shell` | `Bash` | validator が `node` スクリプトを実行するために必須。 |
| 上記以外 | そのまま | 未知のツールは写像せず残し、人間の確認に委ねる。 |

`tools` が空・未指定なら frontmatter の `tools` 行を省略し、Claude Code の既定（全ツール継承）に委ねる。

## 4. hooks/*.kiro.hook → PostToolUse フック

これが最も非自明な変換。Kiro のフックは「サブエージェント完了後にエージェントへ指示文を
注入する（askAgent）」セマンティクスを持つ:

**入力（Kiro hook）:**
```json
{
  "when": { "type": "postToolUse", "toolTypes": [".*invokeSubAgent.*"] },
  "then": { "type": "askAgent", "prompt": "MANDATORY: ... run process_checker ..." }
}
```

Claude Code には「エージェントへ指示文を注入する」専用フック種別が無いので、次のように写像する:

- **トリガ**: Kiro の `invokeSubAgent` 完了 ＝ Claude Code でサブエージェントを起動する
  `Task` ツールの完了。よって `PostToolUse` の `matcher: "Task"`。
- **指示文の注入**: `command` 型フックが stdout に
  `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<prompt>"}}`
  を返すと、その `additionalContext` が次のエージェント応答へ渡る。これで askAgent の
  「指示文注入」を再現する。
- **prompt 内のパス**: `node .kiro/aidlc-common/scripts/...` を `.claude/...` へ書換える。

**出力構成:**

1. `.claude/aidlc-common/hooks/<hook-name>-reminder.json` — 返す JSON 本体（additionalContext を内包）。
2. `.claude/aidlc-common/hooks/<hook-name>-reminder.sh` — その JSON を `cat` するだけの薄いラッパ。
3. `.claude/settings.json` の `hooks.PostToolUse` に次を**非破壊マージ**:
   ```json
   { "matcher": "Task",
     "hooks": [{ "type": "command",
       "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/aidlc-common/hooks/<hook-name>-reminder.sh\"" }] }
   ```

prompt を直接 settings.json にインラインせず別ファイルへ逃がすのは、改行・引用符を含む
長文をシェル文字列へ埋め込む際の破綻を避け、再生成（冪等）を容易にするため。

### settings.json マージの不変条件

- **非破壊**: 既存の `permissions` や他の `PostToolUse` エントリ（例: Edit→prettier）は保持する。
- **冪等**: 同じ reminder を指す `command` が既にあれば追加しない。何度実行しても増えない。
- `--no-settings` 指定時は settings.json を触らず、追記すべきスニペットを出力する（手動マージ用）。

## 変換の限界（人間に委ねる点）

- **orchestrator-protocol の `invokeSubAgent` 表現**: protocol 本文はサブエージェント起動を
  `invokeSubAgent` という Kiro 寄りの語で説明する。Claude Code では `Task` ツールでの
  サブエージェント起動に対応するが、本文は install-root 相対の規約に従う汎用記述なので
  そのまま運用できる。挙動に違和感があればこの語の読み替えを疑う。
- **未知のツール名・新フック種別**: 上流が将来 `write`/`read`/`shell` 以外のツールや
  `postToolUse` 以外のフックを追加した場合、スクリプトは安全側に倒して原文を残す。
  変換後に `.claude/agents/` と `.claude/settings.json` を一読して妥当性を確認すること。
