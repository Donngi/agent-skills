#!/bin/bash
#
# aidlc_finalize.sh - 差分アップデート フェーズ② 確定
#
# Usage:
#   aidlc_finalize.sh [--project-root <dir>] [--accept]
#
# 動作:
#   1. install先に衝突マーカー(<<<<<<< 等)が残っていないか検証（残っていれば停止）
#   2. テキスト以外の衝突(削除衝突/バイナリ等)が記録されていれば --accept を要求
#   3. base を新上流(incoming)で総入替し、manifest を確定更新
#   4. pendingUpdate / incoming / backup を後始末
#
# base はこのスクリプトで初めて新版へ進む。これにより衝突未解決のまま
# base が先行して 3-way が壊れる事態を防ぐ（中断・再開・ロールバックが成立）。
#
# 日本語訳(reference-ja)の更新は Claude が担当。確定後、原文が変わった md は
# `aidlc_status.sh --translation-todo` で列挙される。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
ACCEPT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --accept)       ACCEPT=1; shift ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || aidlc_die "project-root が存在しません"
MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] || aidlc_die "manifest が見つかりません"

INSTALL_PATH="$(jq -r '.installPath' "$MANIFEST")"
# "." は codex 等のマルチルート install で正当（破壊的操作は owned dirs に限定する）
case "$INSTALL_PATH" in ""|"/"|*..*) aidlc_die "manifest の installPath が不正です: '$INSTALL_PATH'";; esac
INSTALL_DIR="$PROJECT_ROOT/$INSTALL_PATH"
TOOL="$(jq -r '.tool' "$MANIFEST")"
# distRoot は tool から再導出し、manifest にも書き戻して旧パスを自己修復する
DIST_ROOT="$(aidlc_dist_root "$TOOL")" || aidlc_die "未対応のツールです: ${TOOL}（対応: claude, kiro, codex）"
BASE="$(aidlc_base_root "$PROJECT_ROOT")"
BASE_DOCS="$(aidlc_base_docs_root "$PROJECT_ROOT")"
INCOMING="$(aidlc_incoming_root "$PROJECT_ROOT")"
INCOMING_DOCS="$(aidlc_incoming_docs_root "$PROJECT_ROOT")"
SWAP_FLAG="$PROJECT_ROOT/$AIDLC_SYNC_DIR/.swap-in-progress"

PENDING="$(jq -r 'if .pendingUpdate then .pendingUpdate.targetCommit else "" end' "$MANIFEST")"

# --- 中断された確定の再開 ---
# manifest は更新済み（pendingUpdate 削除済み）だが base 入替が未完了の状態。
# SWAP_FLAG がその証跡。base を確実に新版へ揃えてから終了する。
if [ -z "$PENDING" ]; then
  if [ -f "$SWAP_FLAG" ]; then
    aidlc_warn "中断された確定を検出しました。base 入替を完了します。"
    if [ -d "$INCOMING" ]; then
      rm -rf "${BASE:?}"; mkdir -p "$(dirname "$BASE")"; mv "$INCOMING" "$BASE"
    fi
    # 参考docs を base/docs へ復元（base 総入替で旧 base/docs は消えるため INCOMING 移送の後に行う）
    if [ -d "$INCOMING_DOCS" ]; then
      rm -rf "${BASE_DOCS:?}"; mkdir -p "$(dirname "$BASE_DOCS")"; mv "$INCOMING_DOCS" "$BASE_DOCS"
    fi
    rm -f "$SWAP_FLAG"
    aidlc_info "base 入替を完了しました。"
    exit 0
  fi
  aidlc_die "確定対象の update がありません（先に aidlc_merge.sh を実行）"
fi

BACKUP_REL="$(jq -r '.pendingUpdate.backup // ""' "$MANIFEST")"
[ -d "$INCOMING" ] || aidlc_die "incoming（新上流の保存）が見つかりません。aidlc_merge.sh --abort で破棄して再実行してください"

# 1. 残存マーカー検証
# 衝突マーカーは <<<<<<< と >>>>>>> で判定（======= は markdown 見出し下線と紛れるため使わない）
# installPath="." のとき INSTALL_DIR は PROJECT_ROOT を指すため、grep は owned dirs に限定して
# プロジェクト全体を走査しない（incoming = 新管理対象ツリーからトップレベル項目を導出）。
OWNED_GREP=()
while IFS= read -r d; do
  [ -z "$d" ] && continue
  OWNED_GREP+=("$PROJECT_ROOT/$d")
done < <(aidlc_owned_dirs "$INSTALL_PATH" "$INCOMING")
if [ ${#OWNED_GREP[@]} -gt 0 ]; then
  markers="$(grep -rIlE '^(<<<<<<<|>>>>>>>)' "${OWNED_GREP[@]}" 2>/dev/null || true)"
else
  markers=""
fi
if [ -n "$markers" ]; then
  aidlc_warn "未解決の衝突マーカーが残っています:"
  echo "$markers" | sed "s|$PROJECT_ROOT/||; s|^|  |" >&2
  aidlc_die "全マーカーを解消してから再実行してください（base は不変なので何度でも再試行可）"
fi

# 2. テキスト以外の衝突は明示承認を要求
nontext="$(jq -r '.pendingUpdate.conflicts // [] | map(select(.kind!="merge")) | .[] | "  [\(.kind)] \(.path) — \(.detail)"' "$MANIFEST")"
if [ -n "$nontext" ] && [ "$ACCEPT" -eq 0 ]; then
  aidlc_warn "マーカーを持たない衝突（削除衝突/バイナリ等）が記録されています:"
  echo "$nontext" >&2
  aidlc_die "対処を確認のうえ、確定するには --accept を付けて再実行してください"
fi

# 3. manifest を「先に」確定する（原子性）。files の sha256/mode は新 base となる
#    incoming から算出する（base 入替後ではなく前に計算）。translatedSha256 は path 単位で引き継ぎ。
OLD_TR="$(jq -c '[.files[]|select(.translatedSha256)|{key:.path,value:.translatedSha256}]|from_entries' "$MANIFEST")"
FILES_JSON="$(
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    printf '%s\t%s\t%s\n' "$rel" "$(aidlc_sha256 "$INCOMING/$rel")" "$(aidlc_mode "$INCOMING/$rel")"
  done < <(aidlc_list_rel "$INCOMING") \
  | jq -R -s 'split("\n")|map(select(length>0))|map(split("\t"))|map({path:.[0],sha256:.[1],mode:.[2]})' \
  | jq --argjson tr "$OLD_TR" 'map(if $tr[.path] then . + {translatedSha256:$tr[.path]} else . end)'
)"

# docFiles も incoming-docs から再生成（docs はマージせず総入替）。translatedSha256 は path 単位で
# 旧 docFiles から引き継ぐ（原文が変わった docs だけが翻訳対象に再浮上する）。
OLD_TR_DOCS="$(jq -c '[(.docFiles // [])[]|select(.translatedSha256)|{key:.path,value:.translatedSha256}]|from_entries' "$MANIFEST")"
DOCS_JSON="[]"
if [ -d "$INCOMING_DOCS" ]; then
  DOCS_JSON="$(
    while IFS= read -r rel; do
      [ -z "$rel" ] && continue
      printf '%s/%s\t%s\n' "$AIDLC_DOCS_PREFIX" "$rel" "$(aidlc_sha256 "$INCOMING_DOCS/$rel")"
    done < <(aidlc_list_rel_md "$INCOMING_DOCS") \
    | jq -R -s 'split("\n")|map(select(length>0))|map(split("\t"))|map({path:.[0],sha256:.[1]})' \
    | jq --argjson tr "$OLD_TR_DOCS" 'map(if $tr[.path] then . + {translatedSha256:$tr[.path]} else . end)'
  )"
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# base 入替の途中中断に備え、manifest 確定の前に印を付ける（再開判定に使う）
: > "$SWAP_FLAG"
tmp="$(mktemp)" || aidlc_die "一時ファイルを作成できません"
jq --argjson files "$FILES_JSON" --argjson docFiles "$DOCS_JSON" --arg target "$PENDING" --arg at "$NOW" --arg distRoot "$DIST_ROOT" \
   '.files=$files | .docFiles=$docFiles | .importedCommit=$target | .lastUpdateCommit=$target | .updatedAt=$at | .upstream.distRoot=$distRoot | del(.pendingUpdate)' \
   "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"

# 4. manifest 確定後に base を incoming で総入替
rm -rf "${BASE:?}"
mkdir -p "$(dirname "$BASE")"
mv "$INCOMING" "$BASE"
# 参考docs を base/docs へ復元（base 総入替で旧 base/docs は消えるため、必ず INCOMING 移送の後）。
# incoming-docs が無い＝上流から docs が消えた場合は base/docs も無いまま（docFiles も空）。
if [ -d "$INCOMING_DOCS" ]; then
  rm -rf "${BASE_DOCS:?}"; mkdir -p "$(dirname "$BASE_DOCS")"; mv "$INCOMING_DOCS" "$BASE_DOCS"
fi
rm -f "$SWAP_FLAG"

# 5. 後始末
[ -n "$BACKUP_REL" ] && [ "$BACKUP_REL" != "null" ] && rm -rf "$PROJECT_ROOT/${BACKUP_REL:?}"

MD_TODO="$(
  jq -r '(.files + (.docFiles // []))[]|select(.path|endswith(".md"))|select((.translatedSha256 // "")!=.sha256)|.path' "$MANIFEST" | wc -l | tr -d ' '
)"
aidlc_info ""
aidlc_info "=== update 確定 ==="
aidlc_info "  importedCommit: $PENDING"
aidlc_info "  base を新上流に更新しました（次回マージの base）。"
aidlc_info ""
aidlc_info "次のステップ:"
aidlc_info "  原文が変わった md の日本語訳を更新してください（${MD_TODO} 件）。"
aidlc_info "  対象一覧: aidlc_status.sh --project-root '$PROJECT_ROOT' --translation-todo"
