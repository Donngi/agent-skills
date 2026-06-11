#!/bin/bash
#
# aidlc_import.sh - aidlc-workflows の初回インポート
#
# Usage:
#   aidlc_import.sh [--project-root <dir>] [--tool kiro|claude] [--install-path <dir>]
#                   [--repo <url>] [--branch <name>] [--commit <sha>] [--dry-run]
#
# install-path 未指定時はツール既定（kiro=.kiro / claude=.claude）。
#
# 動作:
#   1. manifest 既存なら停止（update へ誘導）
#   2. 上流を一時取得し、選択ツールの成果物(dist)を install-path に配置
#      （kiro は一時 clone 内で build.js を実行して dist を生成。claude はビルド済み）
#   3. 同じ内容を .aidlc-sync/base/ に保存（3-way マージの base）
#   4. manifest.json を生成（importedCommit = 解決SHA）
#
# 日本語訳(reference-ja)の生成は Claude が担当するため本スクリプトでは行わない。
# 終了後、訳が未生成の md は `aidlc_status.sh --translation-todo` で列挙できる。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
TOOL="$AIDLC_DEFAULT_TOOL"
INSTALL_PATH=""
REPO="$AIDLC_DEFAULT_REPO"
BRANCH="$AIDLC_DEFAULT_BRANCH"
COMMIT=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --tool)         TOOL="$2"; shift 2 ;;
    --install-path) INSTALL_PATH="$2"; shift 2 ;;
    --repo)         REPO="$2"; shift 2 ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq
[ -d "$PROJECT_ROOT" ] || aidlc_die "project-root が存在しません: $PROJECT_ROOT"
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

DIST_ROOT="$(aidlc_dist_root "$TOOL")" || aidlc_die "未対応のツールです: ${TOOL}（対応: kiro, claude）"
[ -n "$INSTALL_PATH" ] || INSTALL_PATH="$(aidlc_default_install_path "$TOOL")"
# install-path の妥当性検証（プロジェクト外やルートへの書き込みを防ぐ）
case "$INSTALL_PATH" in
  ""|"."|"/"|/*|*..*) aidlc_die "install-path が不正です（プロジェクト相対の安全なパスを指定）: '$INSTALL_PATH'" ;;
esac

MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] && aidlc_die "既に manifest が存在します: ${MANIFEST}（更新は aidlc_merge.sh を使用）"

# 上流取得
TMP="$(mktemp -d)" || aidlc_die "一時ディレクトリを作成できません"
[ -n "$TMP" ] && [ -d "$TMP" ] || aidlc_die "一時ディレクトリの作成に失敗しました"
trap 'rm -rf "$TMP"' EXIT
CLONE="$TMP/upstream"
aidlc_info "上流を取得中: $REPO ($BRANCH${COMMIT:+ @$COMMIT}) ..."
SHA="$(aidlc_fetch_upstream "$CLONE" "$REPO" "$BRANCH" "$COMMIT")" \
  || aidlc_die "上流の取得に失敗しました"
# kiro は clone 内で build.js を実行して dist を生成（claude は no-op）
aidlc_prepare_dist "$CLONE" "$TOOL" || aidlc_die "dist の準備に失敗しました（tool=${TOOL}）"
THEIRS="$CLONE/$DIST_ROOT"
[ -d "$THEIRS" ] || aidlc_die "成果物が見つかりません: ${DIST_ROOT}（ブランチ/ツールを確認）"

# 取り込み対象一覧
FILE_COUNT="$(aidlc_list_rel "$THEIRS" | wc -l | tr -d ' ')"

if [ "$DRY_RUN" -eq 1 ]; then
  aidlc_info ""
  aidlc_info "=== dry-run: 取り込み予定 (${FILE_COUNT} files, commit ${SHA:0:12}) ==="
  aidlc_info "  install-path: $INSTALL_PATH"
  aidlc_list_rel "$THEIRS" | sed 's/^/  + /'
  exit 0
fi

INSTALL_DIR="$PROJECT_ROOT/$INSTALL_PATH"

# クリーン前提チェック: install先に同名ファイルが既存なら停止
CONFLICTS=()
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  [ -e "$INSTALL_DIR/$rel" ] && CONFLICTS+=("$rel")
done < <(aidlc_list_rel "$THEIRS")
if [ ${#CONFLICTS[@]} -gt 0 ]; then
  aidlc_warn "install先に既存ファイルがあります（初回importはクリーンな配置先が前提）:"
  printf '  %s\n' "${CONFLICTS[@]}" >&2
  aidlc_die "配置先を空にするか、既に取り込み済みなら aidlc_merge.sh で更新してください"
fi

# install と base へコピー
BASE="$(aidlc_base_root "$PROJECT_ROOT")"
# 前回の中断で残った可能性のある stale な base/incoming を掃除してから作る
rm -rf "${BASE:?}" "$(aidlc_incoming_root "$PROJECT_ROOT")"
aidlc_copy_tree "$THEIRS" "$INSTALL_DIR" || aidlc_die "install へのコピーに失敗しました: $INSTALL_DIR"
aidlc_copy_tree "$THEIRS" "$BASE" || aidlc_die "base へのコピーに失敗しました: $BASE"

# manifest 生成
FILES_JSON="$(
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    printf '%s\t%s\t%s\n' "$rel" "$(aidlc_sha256 "$BASE/$rel")" "$(aidlc_mode "$BASE/$rel")"
  done < <(aidlc_list_rel "$BASE") \
  | jq -R -s 'split("\n") | map(select(length>0)) | map(split("\t")) | map({path: .[0], sha256: .[1], mode: .[2]})'
)"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "$MANIFEST")"
jq -n \
  --argjson sv "$AIDLC_SCHEMA_VERSION" \
  --arg repo "$REPO" --arg branch "$BRANCH" --arg distRoot "$DIST_ROOT" \
  --arg tool "$TOOL" --arg install "$INSTALL_PATH" \
  --arg commit "$SHA" --arg at "$NOW" \
  --argjson files "$FILES_JSON" \
  '{
     schemaVersion: $sv,
     upstream: { repo: $repo, branch: $branch, distRoot: $distRoot },
     tool: $tool,
     installPath: $install,
     importedCommit: $commit,
     importedAt: $at,
     lastUpdateCommit: null,
     files: $files
   }' > "$MANIFEST"

# 一時生成物（incoming/backup/sentinel）の誤コミットを防ぐ .gitignore を置く。
# manifest と base は追跡対象として残す。
cat > "$PROJECT_ROOT/$AIDLC_SYNC_DIR/.gitignore" <<'GITIGNORE'
/incoming/
/backup-*/
/.swap-in-progress
/.restore-tmp
GITIGNORE

MD_COUNT="$(aidlc_list_rel "$BASE" | grep -c '\.md$' || true)"
aidlc_info ""
aidlc_info "=== import 完了 ==="
aidlc_info "  commit       : $SHA"
aidlc_info "  install-path : $INSTALL_PATH (${FILE_COUNT} files)"
aidlc_info "  manifest     : $AIDLC_SYNC_DIR/manifest.json"
aidlc_info "  base         : $AIDLC_SYNC_DIR/base/ (3-wayマージのbase)"
aidlc_info ""
aidlc_info "次のステップ:"
aidlc_info "  1. 日本語訳が必要な md は ${MD_COUNT} 件。reference-ja/ へ翻訳を生成してください。"
aidlc_info "     対象一覧: aidlc_status.sh --project-root '$PROJECT_ROOT' --translation-todo"
aidlc_info "  2. .aidlc-sync/ ごとコミットすると base をチーム共有でき再現性が出ます。"
