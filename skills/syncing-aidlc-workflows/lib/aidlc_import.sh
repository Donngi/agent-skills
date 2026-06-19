#!/bin/bash
#
# aidlc_import.sh - aidlc-workflows の初回インポート
#
# Usage:
#   aidlc_import.sh [--project-root <dir>] [--tool claude|kiro|codex] [--install-path <dir>]
#                   [--repo <url>] [--branch <name>] [--commit <sha>] [--dry-run]
#
# ツール: claude=Claude Code / kiro=Kiro CLI / codex=Codex CLI。
# install-path 未指定時はツール既定（claude=.claude / kiro=.kiro / codex=.[project root]）。
#
# 動作:
#   1. manifest 既存なら停止（update へ誘導）
#   2. 上流を一時取得し、選択ツールの成果物(dist)を install-path に配置
#      （上流はすべての dist をビルド済みでコミットしているためビルドは不要）
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

DIST_ROOT="$(aidlc_dist_root "$TOOL")" || aidlc_die "未対応のツールです: ${TOOL}（対応: claude, kiro, codex）"
[ -n "$INSTALL_PATH" ] || INSTALL_PATH="$(aidlc_default_install_path "$TOOL")"
# install-path の妥当性検証（プロジェクト外やルートへの書き込みを防ぐ）。
# "."（project root）は codex 等のマルチルート install で正当に使う。粗い破壊的操作は
# aidlc_owned_dirs でトップレベル項目に限定するため、"." でも PROJECT_ROOT 自体は触らない。
case "$INSTALL_PATH" in
  ""|"/"|/*|*..*) aidlc_die "install-path が不正です（プロジェクト相対の安全なパスを指定）: '$INSTALL_PATH'" ;;
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
# 取得した dist を正規化（aidlc の動作に不要な内容を除去）。ビルドは不要（上流がコミット済み）。
aidlc_prepare_dist "$CLONE" "$TOOL" || aidlc_die "dist の準備に失敗しました（tool=${TOOL}）"
THEIRS="$CLONE/$DIST_ROOT"
[ -d "$THEIRS" ] || aidlc_die "成果物が見つかりません: ${DIST_ROOT}（ブランチ/ツールを確認）"

# 取り込み対象一覧
FILE_COUNT="$(aidlc_list_rel "$THEIRS" | wc -l | tr -d ' ')"

# 参考ドキュメント(docs)。dist_root の外（clone ルート直下）にあるハーネス非依存の Markdown。
# インストールはせず base/docs/ にスナップショットして翻訳対象にするだけ。
DOCS_SRC_DIR="$CLONE/$AIDLC_DOCS_SRC"
DOC_COUNT=0
[ -d "$DOCS_SRC_DIR" ] && DOC_COUNT="$(aidlc_list_rel_md "$DOCS_SRC_DIR" | wc -l | tr -d ' ')"

if [ "$DRY_RUN" -eq 1 ]; then
  aidlc_info ""
  aidlc_info "=== dry-run: 取り込み予定 (${FILE_COUNT} files, commit ${SHA:0:12}) ==="
  aidlc_info "  install-path: $INSTALL_PATH"
  aidlc_list_rel "$THEIRS" | sed 's/^/  + /'
  if [ "$DOC_COUNT" -gt 0 ]; then
    aidlc_info ""
    aidlc_info "  参考docs（翻訳のみ・非インストール, ${DOC_COUNT} md）→ base/$AIDLC_DOCS_PREFIX/ :"
    aidlc_list_rel_md "$DOCS_SRC_DIR" | sed "s|^|  + $AIDLC_DOCS_PREFIX/|"
  fi
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

# 参考docs を base/docs/ にスナップショット（install 先へはコピーしない＝参考専用・マージ非対象）
BASE_DOCS="$(aidlc_base_docs_root "$PROJECT_ROOT")"
if [ "$DOC_COUNT" -gt 0 ]; then
  aidlc_copy_tree_md "$DOCS_SRC_DIR" "$BASE_DOCS" || aidlc_die "docs の base スナップショットに失敗しました: $BASE_DOCS"
fi

# manifest 生成。files[] は installed 資産のみ（dist=THEIRS から列挙）。
# base には docs スナップショット(base/docs/)も含まれるため、BASE ではなく THEIRS を列挙元にして
# docs が files[] に混入しないようにする（sha/mode は同一内容の base/<rel> から算出）。
FILES_JSON="$(
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    printf '%s\t%s\t%s\n' "$rel" "$(aidlc_sha256 "$BASE/$rel")" "$(aidlc_mode "$BASE/$rel")"
  done < <(aidlc_list_rel "$THEIRS") \
  | jq -R -s 'split("\n") | map(select(length>0)) | map(split("\t")) | map({path: .[0], sha256: .[1], mode: .[2]})'
)"

# docFiles 生成（path は docs/ プレフィックス付き。base/docs/<rel> と reference-ja/docs/<rel> に対応）
DOCS_JSON="[]"
if [ "$DOC_COUNT" -gt 0 ]; then
  DOCS_JSON="$(
    while IFS= read -r rel; do
      [ -z "$rel" ] && continue
      printf '%s/%s\t%s\n' "$AIDLC_DOCS_PREFIX" "$rel" "$(aidlc_sha256 "$BASE_DOCS/$rel")"
    done < <(aidlc_list_rel_md "$DOCS_SRC_DIR") \
    | jq -R -s 'split("\n") | map(select(length>0)) | map(split("\t")) | map({path: .[0], sha256: .[1]})'
  )"
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "$MANIFEST")"
jq -n \
  --argjson sv "$AIDLC_SCHEMA_VERSION" \
  --arg repo "$REPO" --arg branch "$BRANCH" --arg distRoot "$DIST_ROOT" \
  --arg tool "$TOOL" --arg install "$INSTALL_PATH" \
  --arg commit "$SHA" --arg at "$NOW" \
  --argjson files "$FILES_JSON" \
  --argjson docFiles "$DOCS_JSON" \
  '{
     schemaVersion: $sv,
     upstream: { repo: $repo, branch: $branch, distRoot: $distRoot },
     tool: $tool,
     installPath: $install,
     importedCommit: $commit,
     importedAt: $at,
     lastUpdateCommit: null,
     files: $files,
     docFiles: $docFiles
   }' > "$MANIFEST"

# 一時生成物（incoming/backup/sentinel）の誤コミットを防ぐ .gitignore を置く。
# manifest と base は追跡対象として残す。
cat > "$PROJECT_ROOT/$AIDLC_SYNC_DIR/.gitignore" <<'GITIGNORE'
/incoming/
/incoming-docs/
/backup-*/
/.swap-in-progress
/.restore-tmp
GITIGNORE

# 翻訳対象 md の総数 = installed 資産の md（base 直下、docs スナップショットは除く）+ 参考docs
INSTALLED_MD_COUNT="$(aidlc_list_rel "$THEIRS" | grep -c '\.md$' || true)"
TOTAL_MD_COUNT=$((INSTALLED_MD_COUNT + DOC_COUNT))
aidlc_info ""
aidlc_info "=== import 完了 ==="
aidlc_info "  commit       : $SHA"
aidlc_info "  install-path : $INSTALL_PATH (${FILE_COUNT} files)"
aidlc_info "  manifest     : $AIDLC_SYNC_DIR/manifest.json"
aidlc_info "  base         : $AIDLC_SYNC_DIR/base/ (3-wayマージのbase)"
[ "$DOC_COUNT" -gt 0 ] && aidlc_info "  参考docs     : $AIDLC_SYNC_DIR/base/$AIDLC_DOCS_PREFIX/ (${DOC_COUNT} md・翻訳のみ/非インストール)"
aidlc_info ""
aidlc_info "次のステップ:"
aidlc_info "  1. 日本語訳が必要な md は ${TOTAL_MD_COUNT} 件（install資産 ${INSTALLED_MD_COUNT} + 参考docs ${DOC_COUNT}）。reference-ja/ へ翻訳を生成してください。"
aidlc_info "     対象一覧: aidlc_status.sh --project-root '$PROJECT_ROOT' --translation-todo"
aidlc_info "  2. .aidlc-sync/ ごとコミットすると base をチーム共有でき再現性が出ます。"
