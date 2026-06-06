#!/bin/bash
#
# aidlc_status.sh - 同期状態の診断と翻訳ヘルパー
#
# Usage:
#   aidlc_status.sh [--project-root <dir>]                  # 全体サマリ
#   aidlc_status.sh [--project-root <dir>] --local-changes  # ローカル改変ファイル一覧
#   aidlc_status.sh [--project-root <dir>] --translation-todo  # 翻訳が必要なmd一覧
#   aidlc_status.sh [--project-root <dir>] --mark-translated <relpath>  # 訳の最新化を記録
#
# 終了コード: 0=健全/該当なし, 1=要対応(整合性エラー/保留中update など)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
ACTION="summary"
MARK_PATH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root)     PROJECT_ROOT="$2"; shift 2 ;;
    --local-changes)    ACTION="local"; shift ;;
    --translation-todo) ACTION="todo"; shift ;;
    --mark-translated)  ACTION="mark"; MARK_PATH="$2"; shift 2 ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || aidlc_die "project-root が存在しません"
MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] || aidlc_die "manifest が見つかりません: ${MANIFEST}（先に import してください）"

INSTALL_PATH="$(jq -r '.installPath' "$MANIFEST")"
INSTALL_DIR="$PROJECT_ROOT/$INSTALL_PATH"
BASE="$(aidlc_base_root "$PROJECT_ROOT")"

# tracked md/all path 一覧
tracked_paths() { jq -r '.files[].path' "$MANIFEST"; }

# 現在の install ファイルが base(=manifest.sha256) から変化しているか
list_local_changes() {
  local rel recorded cur
  while IFS= read -r rel; do
    recorded="$(jq -r --arg p "$rel" '.files[]|select(.path==$p)|.sha256' "$MANIFEST")"
    if [ ! -e "$INSTALL_DIR/$rel" ]; then
      echo "D	$rel"          # ローカルで削除
    else
      cur="$(aidlc_sha256 "$INSTALL_DIR/$rel")"
      [ "$cur" != "$recorded" ] && echo "M	$rel"   # ローカルで改変
    fi
  done < <(tracked_paths)
}

# 翻訳が必要な md（translatedSha256 が無い or sha256 と不一致）
list_translation_todo() {
  jq -r '.files[]
          | select(.path | endswith(".md"))
          | select((.translatedSha256 // "") != .sha256)
          | .path' "$MANIFEST"
}

case "$ACTION" in
  local)
    list_local_changes
    ;;

  todo)
    list_translation_todo
    ;;

  mark)
    [ -n "$MARK_PATH" ] || aidlc_die "--mark-translated にはパスが必要です"
    exists="$(jq -r --arg p "$MARK_PATH" '[.files[]|select(.path==$p)]|length' "$MANIFEST")"
    [ "$exists" = "0" ] && aidlc_die "manifest に存在しないパスです: $MARK_PATH"
    tmp="$(mktemp)" || aidlc_die "一時ファイルを作成できません"
    jq --arg p "$MARK_PATH" \
       '.files |= map(if .path==$p then .translatedSha256 = .sha256 else . end)' \
       "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
    aidlc_info "翻訳済みとして記録: $MARK_PATH"
    ;;

  summary)
    rc=0
    IMPORTED="$(jq -r '.importedCommit' "$MANIFEST")"
    TOOL="$(jq -r '.tool' "$MANIFEST")"
    PENDING="$(jq -r 'if .pendingUpdate then .pendingUpdate.targetCommit else "none" end' "$MANIFEST")"
    aidlc_info "=== aidlc-workflows 同期状態 ==="
    aidlc_info "  tool          : $TOOL"
    aidlc_info "  install-path  : $INSTALL_PATH"
    aidlc_info "  importedCommit: $IMPORTED"

    # 整合性: manifest の各ファイルが base に存在し sha 一致するか
    integrity_errs=()
    while IFS= read -r rel; do
      recorded="$(jq -r --arg p "$rel" '.files[]|select(.path==$p)|.sha256' "$MANIFEST")"
      if [ ! -e "$BASE/$rel" ]; then
        integrity_errs+=("base 欠落: $rel")
      elif [ "$(aidlc_sha256 "$BASE/$rel")" != "$recorded" ]; then
        integrity_errs+=("base 改変（破損）: $rel")
      fi
    done < <(tracked_paths)

    if [ ${#integrity_errs[@]} -gt 0 ]; then
      rc=1
      aidlc_info "  整合性        : ❌ 異常 (${#integrity_errs[@]})"
      printf '    - %s\n' "${integrity_errs[@]}"
    else
      aidlc_info "  整合性        : ✅ base と manifest は一致"
    fi

    # ローカル改変
    changes="$(list_local_changes)"
    if [ -n "$changes" ]; then
      aidlc_info "  ローカル改変  : $(echo "$changes" | wc -l | tr -d ' ') 件"
      echo "$changes" | sed 's/^/    /'
    else
      aidlc_info "  ローカル改変  : なし"
    fi

    # 翻訳todo
    todo="$(list_translation_todo)"
    if [ -n "$todo" ]; then
      aidlc_info "  翻訳未更新md  : $(echo "$todo" | wc -l | tr -d ' ') 件 (--translation-todo で一覧)"
    else
      aidlc_info "  翻訳未更新md  : なし"
    fi

    # 保留中update
    if [ "$PENDING" != "none" ]; then
      rc=1
      conflicts="$(jq -r '.pendingUpdate.conflicts // [] | length' "$MANIFEST")"
      aidlc_info "  保留中update  : ⚠️ あり (target=${PENDING:0:12}, 衝突=${conflicts})"
      aidlc_info "                  → 衝突解消後 aidlc_finalize.sh、破棄は aidlc_merge.sh --abort"
    else
      aidlc_info "  保留中update  : なし"
    fi

    exit $rc
    ;;
esac
