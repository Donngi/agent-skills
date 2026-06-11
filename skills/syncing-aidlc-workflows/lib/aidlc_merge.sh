#!/bin/bash
#
# aidlc_merge.sh - 差分アップデート フェーズ① 3-way マージ
#
# Usage:
#   aidlc_merge.sh [--project-root <dir>] [--commit <sha>] [--dry-run] [--force]
#   aidlc_merge.sh [--project-root <dir>] --abort
#
# 動作:
#   base   = .aidlc-sync/base/   （前回取り込んだ無改変版）
#   ours   = <installPath>/          （現在のファイル＝ローカル変更込み）
#   theirs = 取得した新上流の dist
#   をファイル単位で 3-way マージ。自動マージできる箇所は反映し、衝突した
#   箇所のみ install 先に衝突マーカーを残して停止する（git merge-file 方式）。
#
#   base と manifest の確定情報はこのフェーズでは更新しない。
#   衝突解消後に aidlc_finalize.sh で確定する（中断・ロールバック可能）。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
COMMIT=""
DRY_RUN=0
FORCE=0
ABORT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --force)        FORCE=1; shift ;;
    --abort)        ABORT=1; shift ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || aidlc_die "project-root が存在しません"
MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] || aidlc_die "manifest が見つかりません（先に import してください）"

INSTALL_PATH="$(jq -r '.installPath' "$MANIFEST")"
case "$INSTALL_PATH" in ""|"."|"/"|*..*) aidlc_die "manifest の installPath が不正です: '$INSTALL_PATH'";; esac
INSTALL_DIR="$PROJECT_ROOT/$INSTALL_PATH"
BASE="$(aidlc_base_root "$PROJECT_ROOT")"
INCOMING="$(aidlc_incoming_root "$PROJECT_ROOT")"

# --------------------------------------------------------------------------
# --abort: 退避から復元し保留状態を破棄
# --------------------------------------------------------------------------
if [ "$ABORT" -eq 1 ]; then
  PENDING="$(jq -r 'if .pendingUpdate then "yes" else "no" end' "$MANIFEST")"
  [ "$PENDING" = "yes" ] || aidlc_die "保留中の update はありません"
  BACKUP="$(jq -r '.pendingUpdate.backup' "$MANIFEST")"
  if [ -n "$BACKUP" ] && [ "$BACKUP" != "null" ] && [ -d "$PROJECT_ROOT/$BACKUP" ]; then
    # 一時先に復元を組み立て、成功を確認してから原子的に差し替える。
    # （直接 install を消してからコピーすると、途中失敗で install と backup を
    #   同時に失う恐れがある。検証が通るまで元 install と backup は消さない）
    RESTORE="$PROJECT_ROOT/$AIDLC_SYNC_DIR/.restore-tmp"
    rm -rf "$RESTORE"
    if aidlc_copy_tree "$PROJECT_ROOT/$BACKUP" "$RESTORE"; then
      rm -rf "${INSTALL_DIR:?}"
      mv "$RESTORE" "$INSTALL_DIR"
      rm -rf "$PROJECT_ROOT/${BACKUP:?}"
      aidlc_info "install を退避から復元しました: $BACKUP"
    else
      rm -rf "$RESTORE"
      aidlc_die "復元に失敗しました。退避は保持しています: $BACKUP（install を手動確認してください）"
    fi
  else
    aidlc_warn "退避ディレクトリが見つかりません。install は手動確認してください: $BACKUP"
  fi
  rm -rf "$INCOMING"
  tmp="$(mktemp)" || aidlc_die "一時ファイルを作成できません"
  jq 'del(.pendingUpdate)' "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
  aidlc_info "保留中 update を破棄しました。"
  exit 0
fi

# 保留中 update がある状態での新規 merge は拒否
PENDING="$(jq -r 'if .pendingUpdate then .pendingUpdate.targetCommit else "" end' "$MANIFEST")"
[ -n "$PENDING" ] && aidlc_die "未確定の update があります（target=${PENDING:0:12}）。先に aidlc_finalize.sh で確定するか --abort で破棄してください"

REPO="$(jq -r '.upstream.repo' "$MANIFEST")"
BRANCH="$(jq -r '.upstream.branch' "$MANIFEST")"
DIST_ROOT="$(jq -r '.upstream.distRoot' "$MANIFEST")"
TOOL="$(jq -r '.tool' "$MANIFEST")"
IMPORTED="$(jq -r '.importedCommit' "$MANIFEST")"

# dirty チェック（git管理下のみ）。ロールバックの安全網を確保するため
if [ "$DRY_RUN" -eq 0 ] && aidlc_have git && git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  dirty="$(git -C "$PROJECT_ROOT" status --porcelain -- "$INSTALL_PATH" "$AIDLC_SYNC_DIR" 2>/dev/null)"
  if [ -n "$dirty" ] && [ "$FORCE" -eq 0 ]; then
    aidlc_warn "$INSTALL_PATH / $AIDLC_SYNC_DIR に未コミットの変更があります:"
    echo "$dirty" | sed 's/^/  /' >&2
    aidlc_die "コミットまたは stash してから実行してください（強行は --force）。これは git checkout で戻せる状態を確保するためです"
  fi
fi

# 3-way マージには git merge-file が必要
aidlc_require git

# 上流取得
TMP="$(mktemp -d)" || aidlc_die "一時ディレクトリを作成できません"
[ -n "$TMP" ] && [ -d "$TMP" ] || aidlc_die "一時ディレクトリの作成に失敗しました"
trap 'rm -rf "$TMP"' EXIT
CLONE="$TMP/upstream"
aidlc_info "上流を取得中: $REPO ($BRANCH${COMMIT:+ @$COMMIT}) ..."
NEW_SHA="$(aidlc_fetch_upstream "$CLONE" "$REPO" "$BRANCH" "$COMMIT")" \
  || aidlc_die "上流の取得に失敗しました"
# kiro は clone 内で build.js を実行して dist を生成（claude は no-op）
aidlc_prepare_dist "$CLONE" "$TOOL" || aidlc_die "dist の準備に失敗しました（tool=${TOOL}）"
THEIRS="$CLONE/$DIST_ROOT"
[ -d "$THEIRS" ] || aidlc_die "成果物が見つかりません: $DIST_ROOT"

if [ "$NEW_SHA" = "$IMPORTED" ]; then
  aidlc_info "上流に変更はありません（最新版を取り込み済み）。"
  exit 0
fi

EMPTY="$TMP/empty"; : > "$EMPTY"

# 件数カウンタ
n_unchanged=0 n_ff=0 n_merge=0 n_add=0 n_del=0 n_localdel=0
CONFLICTS_TSV=()   # path<TAB>kind<TAB>detail

universe="$( { aidlc_list_rel "$BASE"; aidlc_list_rel "$THEIRS"; } | LC_ALL=C sort -u )"

# 実書き込みフェーズなら退避と incoming 準備
if [ "$DRY_RUN" -eq 0 ]; then
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_REL="$AIDLC_SYNC_DIR/backup-$TS"
  BACKUP_DIR="$PROJECT_ROOT/$BACKUP_REL"
  aidlc_copy_tree "$INSTALL_DIR" "$BACKUP_DIR" || aidlc_die "install の退避に失敗しました: $BACKUP_DIR"
  rm -rf "$INCOMING"
  aidlc_copy_tree "$THEIRS" "$INCOMING" || aidlc_die "新上流の退避(incoming)に失敗しました: $INCOMING"
  # install を書き換える「前」に pendingUpdate を記録する。途中で中断しても
  # status が保留を検知でき、--abort で backup から安全に戻せる（冪等再試行が成立）。
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  tmp="$(mktemp)" || aidlc_die "一時ファイルを作成できません"
  jq --arg target "$NEW_SHA" --arg backup "$BACKUP_REL" --arg at "$NOW" \
     '.pendingUpdate = {targetCommit:$target, startedAt:$at, backup:$backup, conflicts:[]}' \
     "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
fi

# 1ファイル単位の処理
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  b="$BASE/$rel"; o="$INSTALL_DIR/$rel"; t="$THEIRS/$rel"
  bb=0; oo=0; tt=0
  [ -e "$b" ] && bb=1; [ -e "$o" ] && oo=1; [ -e "$t" ] && tt=1

  # --- 上流に存在 ---
  if [ $tt -eq 1 ]; then
    if [ $bb -eq 1 ]; then
      # base あり: 通常の3者
      if [ "$(aidlc_sha256 "$b")" = "$(aidlc_sha256 "$t")" ]; then
        n_unchanged=$((n_unchanged+1)); continue           # 上流変更なし
      fi
      if [ $oo -eq 0 ]; then
        # ローカル削除 × 上流変更 → 衝突（既定: 復活させない）
        CONFLICTS_TSV+=("$rel	delete-update	ローカルで削除済みだが上流が更新。復活させていません")
        continue
      fi
      if [ "$(aidlc_sha256 "$o")" = "$(aidlc_sha256 "$b")" ]; then
        # ローカル未改変 → 上流版へ早送り
        n_ff=$((n_ff+1))
        [ "$DRY_RUN" -eq 0 ] && { mkdir -p "$(dirname "$o")"; cp "$t" "$o"; }
        continue
      fi
      # ローカル改変 × 上流改変 → 3-way
      if aidlc_is_text "$o" && aidlc_is_text "$t" && aidlc_is_text "$b"; then
        if [ "$DRY_RUN" -eq 0 ]; then
          merged="$TMP/merged"
          git merge-file -p \
            -L "ローカル変更 (あなた)" -L "前回取込 (base)" -L "上流新版" \
            "$o" "$b" "$t" > "$merged" 2>/dev/null
          rc=$?
          cp "$merged" "$o"
          if [ "$rc" -gt 0 ] && [ "$rc" -ne 255 ]; then
            CONFLICTS_TSV+=("$rel	merge	${rc} 箇所が衝突（install先にマーカーあり）")
          elif [ "$rc" -eq 255 ]; then
            CONFLICTS_TSV+=("$rel	merge	マージ実行エラー")
          else
            n_merge=$((n_merge+1))
          fi
        else
          # dry-run: 衝突有無を判定（-q相当: 出力捨てて終了コードのみ）
          git merge-file -p "$o" "$b" "$t" >/dev/null 2>&1
          rc=$?
          if [ "$rc" -gt 0 ]; then CONFLICTS_TSV+=("$rel	merge	${rc} 箇所が衝突予測"); else n_merge=$((n_merge+1)); fi
        fi
      else
        CONFLICTS_TSV+=("$rel	binary	テキストでないため自動マージ不可（ローカルを保持）")
      fi
    else
      # base なし & 上流あり
      if [ $oo -eq 0 ]; then
        n_add=$((n_add+1))                                  # 上流の新規追加
        [ "$DRY_RUN" -eq 0 ] && { mkdir -p "$(dirname "$o")"; cp "$t" "$o"; }
      elif [ "$(aidlc_sha256 "$o")" = "$(aidlc_sha256 "$t")" ]; then
        n_add=$((n_add+1))                                  # 既に同一内容 → 取り込み済み扱い
      else
        # ローカルに別内容の同名ファイル × 上流新規 → add/add 衝突
        if [ "$DRY_RUN" -eq 0 ] && aidlc_is_text "$o" && aidlc_is_text "$t"; then
          merged="$TMP/merged"
          git merge-file -p -L "ローカル変更 (あなた)" -L "(空)" -L "上流新版" \
            "$o" "$EMPTY" "$t" > "$merged" 2>/dev/null
          cp "$merged" "$o"
        fi
        CONFLICTS_TSV+=("$rel	add-add	ローカルに別内容の同名ファイルあり（上流新規と衝突）")
      fi
    fi
  else
    # --- 上流に存在しない（削除） ---
    if [ $bb -eq 1 ] && [ $oo -eq 1 ]; then
      if [ "$(aidlc_sha256 "$o")" = "$(aidlc_sha256 "$b")" ]; then
        n_del=$((n_del+1))                                  # ローカル未改変 → 削除
        [ "$DRY_RUN" -eq 0 ] && rm -f "$o"
      else
        CONFLICTS_TSV+=("$rel	delete-modified	上流が削除したがローカルで改変済み（ローカルを保持）")
      fi
    elif [ $bb -eq 1 ] && [ $oo -eq 0 ]; then
      n_localdel=$((n_localdel+1))                          # 双方削除 → 何もしない
    fi
    # それ以外（base無し・上流無し・ローカルのみ）= ユーザー独自ファイル → 触らない
  fi
done <<< "$universe"

n_conflict=${#CONFLICTS_TSV[@]}

# サマリ表示
dry_suffix=""; [ "$DRY_RUN" -eq 1 ] && dry_suffix=" (dry-run)"
aidlc_info ""
aidlc_info "=== 3-way マージ ${IMPORTED:0:12} → ${NEW_SHA:0:12}${dry_suffix} ==="
aidlc_info "  早送り(ローカル未改変): $n_ff"
aidlc_info "  自動マージ            : $n_merge"
aidlc_info "  新規追加              : $n_add"
aidlc_info "  削除                  : $n_del"
aidlc_info "  上流変更なし          : $n_unchanged"
aidlc_info "  衝突                  : $n_conflict"
if [ "$n_conflict" -gt 0 ]; then
  aidlc_info ""
  aidlc_info "--- 衝突一覧（手動解決が必要）---"
  for line in "${CONFLICTS_TSV[@]}"; do
    p="${line%%	*}"; rest="${line#*	}"; kind="${rest%%	*}"; detail="${rest#*	}"
    aidlc_info "  [$kind] $p"
    aidlc_info "          $detail"
  done
fi

if [ "$DRY_RUN" -eq 1 ]; then
  rm -rf "$INCOMING" 2>/dev/null || true
  exit 0
fi

# pendingUpdate.conflicts を確定（pendingUpdate 本体は merge 開始時に記録済み。
# base/manifest の確定情報はまだ更新しない＝finalize まで base は不変）
CONFLICTS_JSON="$(
  if [ "$n_conflict" -gt 0 ]; then
    printf '%s\n' "${CONFLICTS_TSV[@]}" \
      | jq -R -s 'split("\n")|map(select(length>0))|map(split("\t"))|map({path:.[0],kind:.[1],detail:.[2]})'
  else
    echo '[]'
  fi
)"
tmp="$(mktemp)" || aidlc_die "一時ファイルを作成できません"
jq --argjson conflicts "$CONFLICTS_JSON" '.pendingUpdate.conflicts = $conflicts' \
   "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"

aidlc_info ""
if [ "$n_conflict" -gt 0 ]; then
  aidlc_info "衝突を解消してください（install先のマーカー <<<<<<< を編集）。"
  aidlc_info "解消後: aidlc_finalize.sh --project-root '$PROJECT_ROOT'"
  aidlc_info "やり直し: aidlc_merge.sh --project-root '$PROJECT_ROOT' --abort"
else
  aidlc_info "衝突なし。確定するには: aidlc_finalize.sh --project-root '$PROJECT_ROOT'"
fi
