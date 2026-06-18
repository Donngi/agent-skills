#!/usr/bin/env bash
# =============================================================================
# aidlc_to_claude.sh — Kiro 形式の AI-DLC 成果物から Claude Code 用設定を生成する
# 決定論的コンバータ。
#
# WHAT:
#   入力 ${PROJECT}/.kiro/ （syncing-aidlc-workflows が配置した Kiro 成果物）を読み、
#   ${PROJECT}/.claude/ に Claude Code が解釈できる形へ変換して書き出す。
#
#   変換の大半は「再配置」で済む。AI-DLC コンテンツは install root 相対パス
#   （`skills/...`, `aidlc-common/...`）で書かれているため、.kiro/ → .claude/ に
#   置くだけで参照が成立する。Kiro 固有フォーマットに依存するのは次の3点のみ:
#     1. agents/*.json  → .claude/agents/*.md         （JSON→Markdown + ツール名変換）
#     2. hooks/*.kiro.hook → .claude/settings.json    （PostToolUse hook へ変換・マージ）
#     3. *.js 内のハードコード ".kiro" パス → ".claude" へ書換え
#
# 冪等: 何度実行しても同じ結果。settings.json への hook 追記も重複しない。
#
# USAGE:
#   bash aidlc_to_claude.sh [--project-root DIR] [--kiro-root DIR]
#        [--claude-root DIR] [--dry-run] [--no-settings]
#
# EXIT: 0 成功 / 1 失敗（前提不足・入力なし等）
# =============================================================================
set -euo pipefail

# ---- 引数 -------------------------------------------------------------------
PROJECT_ROOT=""
KIRO_ROOT=""
CLAUDE_ROOT=""
DRY_RUN=0
NO_SETTINGS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --kiro-root)    KIRO_ROOT="$2";    shift 2 ;;
    --claude-root)  CLAUDE_ROOT="$2";  shift 2 ;;
    --dry-run)      DRY_RUN=1;         shift ;;
    --no-settings)  NO_SETTINGS=1;     shift ;;
    -h|--help)      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
done

# ---- 依存チェック -----------------------------------------------------------
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq が必要です" >&2; exit 1; }

# ---- ルート解決 -------------------------------------------------------------
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
[[ -z "$KIRO_ROOT"   ]] && KIRO_ROOT="$PROJECT_ROOT/.kiro"
[[ -z "$CLAUDE_ROOT" ]] && CLAUDE_ROOT="$PROJECT_ROOT/.claude"

# ---- 前提検証 ---------------------------------------------------------------
if [[ ! -d "$KIRO_ROOT" ]]; then
  echo "ERROR: Kiro コンテンツが見つかりません: $KIRO_ROOT" >&2
  echo "       先に syncing-aidlc-workflows で .kiro を取り込んでください。" >&2
  exit 1
fi
if [[ ! -d "$KIRO_ROOT/skills" || ! -d "$KIRO_ROOT/aidlc-common" ]]; then
  echo "ERROR: $KIRO_ROOT は AI-DLC の Kiro 成果物ではないようです" >&2
  echo "       （skills/ と aidlc-common/ が必要）" >&2
  exit 1
fi

# ---- ログ補助 ---------------------------------------------------------------
GENERATED=()  # 生成/更新したパス（PROJECT 相対）
rel() { echo "${1#"$PROJECT_ROOT"/}"; }
note() { GENERATED+=("$1"); }

echo "AI-DLC Kiro → Claude Code 変換"
echo "  入力 : $(rel "$KIRO_ROOT")"
echo "  出力 : $(rel "$CLAUDE_ROOT")"
[[ $DRY_RUN -eq 1 ]] && echo "  （dry-run: 書き込みは行いません）"
echo ""

# 既存 .claude/skills や .claude/aidlc-common がある場合は再配置で上書きされる。
# 上書きの是非は呼び出し側（Claude）が dry-run で確認する前提。
# settings.json だけは常に非破壊マージ（既存設定を保持）。

# =============================================================================
# 1. skills/ をそのままミラー（install root 相対パスなので無改変でよい）
# =============================================================================
echo "[1/4] skills/ を複製"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$CLAUDE_ROOT/skills"
  # rsync があれば使う。無ければ cp -R。
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete-excluded "$KIRO_ROOT/skills/" "$CLAUDE_ROOT/skills/"
  else
    rm -rf "$CLAUDE_ROOT/skills"
    cp -R "$KIRO_ROOT/skills" "$CLAUDE_ROOT/skills"
  fi
fi
while IFS= read -r d; do note "$(rel "$CLAUDE_ROOT/skills/$d")"; done < <(
  find "$KIRO_ROOT/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort)

# =============================================================================
# 2. aidlc-common/ を複製し、*.js 内のハードコード .kiro パスを .claude へ書換え
# =============================================================================
echo "[2/4] aidlc-common/ を複製（.js の .kiro パスを書換え）"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$CLAUDE_ROOT/aidlc-common"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$KIRO_ROOT/aidlc-common/" "$CLAUDE_ROOT/aidlc-common/"
  else
    rm -rf "$CLAUDE_ROOT/aidlc-common"
    cp -R "$KIRO_ROOT/aidlc-common" "$CLAUDE_ROOT/aidlc-common"
  fi
  # コード内の install-root リテラルのみ書換える（.md の説明文は触らない）。
  # 例: path.join(".kiro", "skills", ...) → path.join(".claude", "skills", ...)
  while IFS= read -r js; do
    sed -i.bak 's#"\.kiro"#"\.claude"#g; s#\.kiro/#\.claude/#g' "$js"
    rm -f "$js.bak"
  done < <(find "$CLAUDE_ROOT/aidlc-common" -name '*.js' -type f)
fi
note "$(rel "$CLAUDE_ROOT/aidlc-common")/"

# =============================================================================
# 3. agents/*.json → .claude/agents/*.md
#    Kiro のツール名を Claude Code のツール名へ写像:
#      read → Read / write → Write, Edit / shell → Bash
# =============================================================================
echo "[3/4] agents/*.json → .claude/agents/*.md"
map_tool() {
  case "$1" in
    read)  echo "Read" ;;
    write) echo "Write, Edit" ;;
    shell) echo "Bash" ;;
    *)     echo "$1" ;;   # 未知のツールはそのまま（人間が確認）
  esac
}
if [[ -d "$KIRO_ROOT/agents" ]]; then
  [[ $DRY_RUN -eq 0 ]] && mkdir -p "$CLAUDE_ROOT/agents"
  while IFS= read -r jsonf; do
    name="$(jq -r '.name' "$jsonf")"
    desc="$(jq -r '.description' "$jsonf")"
    prompt="$(jq -r '.prompt' "$jsonf")"
    # tools 配列 → 写像 → カンマ区切り（重複除去・順序維持）
    tools_csv="$(jq -r '.tools[]?' "$jsonf" | while read -r t; do map_tool "$t"; done \
      | tr ',' '\n' | sed 's/^ *//;s/ *$//' | awk 'NF && !seen[$0]++' \
      | paste -sd ',' - | sed 's/,/, /g')"
    out="$CLAUDE_ROOT/agents/${name}.md"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  [dry-run] write $(rel "$out")  (tools: ${tools_csv:-<inherit>})"
    else
      {
        echo "---"
        echo "name: ${name}"
        echo "description: ${desc}"
        [[ -n "$tools_csv" ]] && echo "tools: ${tools_csv}"
        echo "---"
        echo ""
        printf '%s\n' "$prompt"
      } > "$out"
    fi
    note "$(rel "$out")"
  done < <(find "$KIRO_ROOT/agents" -name '*.json' -type f | LC_ALL=C sort)
fi

# =============================================================================
# 4. hooks/*.kiro.hook → reminder スクリプト + .claude/settings.json へマージ
#    Kiro: postToolUse(invokeSubAgent) / askAgent(prompt)
#    Claude: PostToolUse(matcher=Task) の command フックが additionalContext を返す
# =============================================================================
echo "[4/4] hooks/*.kiro.hook → reminder + settings.json"
HOOKS_DIR="$CLAUDE_ROOT/aidlc-common/hooks"
SETTINGS_SNIPPET=""
if [[ -d "$KIRO_ROOT/hooks" ]] && compgen -G "$KIRO_ROOT/hooks/*.hook" >/dev/null; then
  [[ $DRY_RUN -eq 0 ]] && mkdir -p "$HOOKS_DIR"
  # 追加すべき PostToolUse(Task) エントリを集める
  ENTRIES_FILE="$(mktemp)"
  echo "[]" > "$ENTRIES_FILE"

  while IFS= read -r hookf; do
    hname="$(jq -r '.name' "$hookf")"
    # askAgent の prompt 内 .kiro/ を .claude/ に書換え
    aprompt="$(jq -r '.then.prompt // ""' "$hookf" | sed 's#\.kiro/#\.claude/#g')"
    # reminder JSON（additionalContext として返す本体）
    rjson="$HOOKS_DIR/${hname}-reminder.json"
    rsh="$HOOKS_DIR/${hname}-reminder.sh"
    if [[ $DRY_RUN -eq 0 ]]; then
      jq -n --arg ctx "$aprompt" \
        '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}' > "$rjson"
      cat > "$rsh" <<'SH'
#!/usr/bin/env bash
# AI-DLC: サブエージェント完了後に process_checker 実行を促すリマインダ。
# PostToolUse(Task) フックから呼ばれ、additionalContext を stdout に返す。
cat "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}" .sh).json"
SH
      chmod +x "$rsh"
    fi
    note "$(rel "$rsh")"; note "$(rel "$rjson")"
    # settings.json 用エントリ
    cmd="bash \"\$CLAUDE_PROJECT_DIR/$(rel "$rsh")\""
    jq --arg cmd "$cmd" \
      '. += [{matcher:"Task",hooks:[{type:"command",command:$cmd}]}]' \
      "$ENTRIES_FILE" > "$ENTRIES_FILE.tmp" && mv "$ENTRIES_FILE.tmp" "$ENTRIES_FILE"
  done < <(find "$KIRO_ROOT/hooks" -name '*.hook' -type f | LC_ALL=C sort)

  SETTINGS="$CLAUDE_ROOT/settings.json"
  if [[ $NO_SETTINGS -eq 1 ]]; then
    SETTINGS_SNIPPET="$(jq '{hooks:{PostToolUse:.}}' "$ENTRIES_FILE")"
  else
    # 非破壊マージ: 既存 settings.json があれば読み、無ければ {} から。
    base="{}"
    [[ -f "$SETTINGS" ]] && base="$(cat "$SETTINGS")"
    # reminder を指す command が既にあれば追加しない（冪等）
    existing_cmds="$(jq -r '.hooks.PostToolUse[]?.hooks[]?.command // empty' <<<"$base" 2>/dev/null || true)"
    add_filtered="$(jq --arg ex "$existing_cmds" '
      [ .[] | select( (.hooks[0].command) as $c | ($ex | contains($c)) | not ) ]
    ' "$ENTRIES_FILE")"
    merged="$(jq --argjson add "$add_filtered" '
      .hooks //= {} | .hooks.PostToolUse //= [] |
      .hooks.PostToolUse += $add
    ' <<<"$base")"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  [dry-run] $(rel "$SETTINGS") へ次をマージ:"
      echo "$add_filtered" | jq '{hooks:{PostToolUse:.}}' | sed 's/^/    /'
    else
      mkdir -p "$CLAUDE_ROOT"
      echo "$merged" | jq '.' > "$SETTINGS"
    fi
    note "$(rel "$SETTINGS")"
  fi
  rm -f "$ENTRIES_FILE"
fi

# =============================================================================
# まとめ
# =============================================================================
echo ""
echo "✅ 変換${DRY_RUN:+（プレビュー）}完了"
echo "生成/更新:"
printf '  - %s\n' "${GENERATED[@]}" | LC_ALL=C sort -u
if [[ -n "$SETTINGS_SNIPPET" ]]; then
  echo ""
  echo "▼ settings.json へ手動で追記するスニペット（--no-settings 指定）:"
  echo "$SETTINGS_SNIPPET" | sed 's/^/  /'
fi
