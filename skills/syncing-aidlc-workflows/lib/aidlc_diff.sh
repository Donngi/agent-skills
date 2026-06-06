#!/bin/bash
#
# aidlc_diff.sh - 上流の差分（前回取り込み版 → 新版）を提示する
#
# Usage:
#   aidlc_diff.sh [--project-root <dir>] [--commit <sha>] [--stat-only]
#
# base（= 前回取り込んだ無改変版）と新上流(theirs)を比較する。
# これは「上流側で何が変わったか」を表し、ローカル変更とは独立。
# git があれば importedCommit..newCommit のコミットログも補助表示する。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
COMMIT=""
STAT_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --stat-only)    STAT_ONLY=1; shift ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || aidlc_die "project-root が存在しません"
MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] || aidlc_die "manifest が見つかりません（先に import してください）"

REPO="$(jq -r '.upstream.repo' "$MANIFEST")"
BRANCH="$(jq -r '.upstream.branch' "$MANIFEST")"
DIST_ROOT="$(jq -r '.upstream.distRoot' "$MANIFEST")"
IMPORTED="$(jq -r '.importedCommit' "$MANIFEST")"
BASE="$(aidlc_base_root "$PROJECT_ROOT")"

TMP="$(mktemp -d)" || aidlc_die "一時ディレクトリを作成できません"
[ -n "$TMP" ] && [ -d "$TMP" ] || aidlc_die "一時ディレクトリの作成に失敗しました"
trap 'rm -rf "$TMP"' EXIT
CLONE="$TMP/upstream"
aidlc_info "上流を取得中: $REPO ($BRANCH${COMMIT:+ @$COMMIT}) ..."
NEW_SHA="$(aidlc_fetch_upstream "$CLONE" "$REPO" "$BRANCH" "$COMMIT")" \
  || aidlc_die "上流の取得に失敗しました"
THEIRS="$CLONE/$DIST_ROOT"
[ -d "$THEIRS" ] || aidlc_die "ビルド済み成果物が見つかりません: $DIST_ROOT"

if [ "$NEW_SHA" = "$IMPORTED" ]; then
  aidlc_info "上流に変更はありません（最新版を取り込み済み: ${IMPORTED:0:12}）。"
  exit 0
fi

aidlc_info ""
aidlc_info "=== 上流差分: ${IMPORTED:0:12} → ${NEW_SHA:0:12} ==="

# 分類
added=(); modified=(); deleted=()
universe="$( { aidlc_list_rel "$BASE"; aidlc_list_rel "$THEIRS"; } | LC_ALL=C sort -u )"
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  inb=0; int=0
  [ -e "$BASE/$rel" ] && inb=1
  [ -e "$THEIRS/$rel" ] && int=1
  if   [ $inb -eq 0 ] && [ $int -eq 1 ]; then added+=("$rel")
  elif [ $inb -eq 1 ] && [ $int -eq 0 ]; then deleted+=("$rel")
  elif [ "$(aidlc_sha256 "$BASE/$rel")" != "$(aidlc_sha256 "$THEIRS/$rel")" ]; then modified+=("$rel")
  fi
done <<< "$universe"

aidlc_info "  追加: ${#added[@]} / 変更: ${#modified[@]} / 削除: ${#deleted[@]}"
aidlc_info ""
[ ${#added[@]}    -gt 0 ] && printf '  A %s\n' "${added[@]}"
[ ${#modified[@]} -gt 0 ] && printf '  M %s\n' "${modified[@]}"
[ ${#deleted[@]}  -gt 0 ] && printf '  D %s\n' "${deleted[@]}"

# git があればコミットログを補助表示
if aidlc_have git && [ -d "$CLONE/.git" ]; then
  log="$(git -C "$CLONE" log --oneline "${IMPORTED}..${NEW_SHA}" -- "$DIST_ROOT" 2>/dev/null)"
  if [ -n "$log" ]; then
    aidlc_info ""
    aidlc_info "--- 上流コミット (${DIST_ROOT}) ---"
    echo "$log" | sed 's/^/  /'
  fi
fi

if [ "$STAT_ONLY" -eq 1 ]; then
  exit 0
fi

# 変更ファイルの中身差分
if [ ${#modified[@]} -gt 0 ]; then
  aidlc_info ""
  aidlc_info "--- 変更内容 (unified diff) ---"
  for rel in "${modified[@]}"; do
    diff -u "$BASE/$rel" "$THEIRS/$rel" \
      --label "a/$rel (前回取込)" --label "b/$rel (上流新版)" || true
  done
fi
