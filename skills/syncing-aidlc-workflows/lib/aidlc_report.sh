#!/bin/bash
#
# aidlc_report.sh - 上流差分を「サイドバイサイドの自己完結 HTML レポート」に書き出す
#
# Usage:
#   aidlc_report.sh [--project-root <dir>] [--commit <sha>] [--out <path>]
#
# base（= 前回取り込んだ無改変版）と新上流(theirs)を比較し、人間が「何がどう変わったか」を
# パッと確認できる HTML を生成する。これは aidlc_diff.sh と同じ「上流側で何が変わったか」を
# 表し、ローカル変更とは独立。
#
# 設計（決定論とAIの分担）:
#   - サイドバイサイド diff / 統計 / コミットログ = このスクリプトが決定論的に生成（忠実な再現）。
#   - 「変更の挙動説明」「まとめ」= Claude が後から記入する差し込み枠（HTMLコメントで明示）。
#     枠は <!-- AIDLC:SUMMARY:START --> .. :END / <!-- AIDLC:IMPACT:START --> .. :END で囲う。
#
# 依存は既存スクリプトと同じ（git / jq / awk）。GNU 限定の diff フラグは使わず、git に必須依存する
# `git diff --no-index` の unified diff を awk で2カラムに整形するため macOS(BSD)/Linux 双方で動く。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

PROJECT_ROOT="."
COMMIT=""
OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --out)          OUT="$2"; shift 2 ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

aidlc_require jq git
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || aidlc_die "project-root が存在しません"
MANIFEST="$(aidlc_manifest_path "$PROJECT_ROOT")"
[ -f "$MANIFEST" ] || aidlc_die "manifest が見つかりません（先に import してください）"

REPO="$(jq -r '.upstream.repo' "$MANIFEST")"
BRANCH="$(jq -r '.upstream.branch' "$MANIFEST")"
TOOL="$(jq -r '.tool' "$MANIFEST")"
# distRoot は manifest 保存値ではなく tool から再導出する（上流のパス再編に追従＝self-heal）。
DIST_ROOT="$(aidlc_dist_root "$TOOL")" || aidlc_die "未対応のツールです: ${TOOL}（対応: claude, kiro, codex）"
IMPORTED="$(jq -r '.importedCommit' "$MANIFEST")"
BASE="$(aidlc_base_root "$PROJECT_ROOT")"
BASE_DOCS="$(aidlc_base_docs_root "$PROJECT_ROOT")"

TMP="$(mktemp -d)" || aidlc_die "一時ディレクトリを作成できません"
[ -n "$TMP" ] && [ -d "$TMP" ] || aidlc_die "一時ディレクトリの作成に失敗しました"
trap 'rm -rf "$TMP"' EXIT
EMPTY="$TMP/empty"; : > "$EMPTY"
CLONE="$TMP/upstream"

aidlc_info "上流を取得中: $REPO ($BRANCH${COMMIT:+ @$COMMIT}) ..."
NEW_SHA="$(aidlc_fetch_upstream "$CLONE" "$REPO" "$BRANCH" "$COMMIT")" \
  || aidlc_die "上流の取得に失敗しました"
# 取得した dist を正規化（aidlc の動作に不要な内容を除去）。ビルドは不要（上流がコミット済み）。
aidlc_prepare_dist "$CLONE" "$TOOL" || aidlc_die "dist の準備に失敗しました（tool=${TOOL}）"
THEIRS="$CLONE/$DIST_ROOT"
[ -d "$THEIRS" ] || aidlc_die "成果物が見つかりません: $DIST_ROOT"
DOCS_SRC_DIR="$CLONE/$AIDLC_DOCS_SRC"

if [ "$NEW_SHA" = "$IMPORTED" ]; then
  aidlc_info "上流に変更はありません（最新版を取り込み済み: ${IMPORTED:0:12}）。レポートは生成しません。"
  exit 0
fi

# --------------------------------------------------------------------------
# 分類（base ↔ theirs）。aidlc_diff.sh と同一ロジック。
# --------------------------------------------------------------------------
added=(); modified=(); deleted=()
# base には docs スナップショット(base/docs/)も含まれる。docs は install 資産ではなく
# 別途 docFiles として扱うため、install 資産の分類からは docs/ サブツリーを除外する
# （import.sh が files[] 生成時に THEIRS を列挙して docs 混入を避けているのと同じ理由）。
universe="$( { aidlc_list_rel "$BASE" | grep -v "^$AIDLC_DOCS_PREFIX/" || true; aidlc_list_rel "$THEIRS"; } | LC_ALL=C sort -u )"
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

# 参考docs の件数（base/docs ↔ 新上流 docs）。docs はマージせず翻訳のみだが、変更件数は提示する。
d_add=0; d_mod=0; d_del=0
docs_universe="$( { aidlc_list_rel_md "$BASE_DOCS"; aidlc_list_rel_md "$DOCS_SRC_DIR"; } | LC_ALL=C sort -u )"
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  inb=0; int=0
  [ -e "$BASE_DOCS/$rel" ] && inb=1
  [ -e "$DOCS_SRC_DIR/$rel" ] && int=1
  if   [ $inb -eq 0 ] && [ $int -eq 1 ]; then d_add=$((d_add+1))
  elif [ $inb -eq 1 ] && [ $int -eq 0 ]; then d_del=$((d_del+1))
  elif [ "$(aidlc_sha256 "$BASE_DOCS/$rel")" != "$(aidlc_sha256 "$DOCS_SRC_DIR/$rel")" ]; then d_mod=$((d_mod+1))
  fi
done <<< "$docs_universe"

# --------------------------------------------------------------------------
# 出力先
# --------------------------------------------------------------------------
TS="$(date -u +%Y%m%dT%H%M%SZ)"
GEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ -z "$OUT" ]; then
  OUT="$PROJECT_ROOT/$AIDLC_SYNC_DIR/reports/aidlc-report-$TS.html"
fi
mkdir -p "$(dirname "$OUT")" || aidlc_die "出力先ディレクトリを作成できません: $(dirname "$OUT")"

# --------------------------------------------------------------------------
# HTML 補助
# --------------------------------------------------------------------------
# シェル変数の HTML エスケープ（属性/テキスト共用）
html_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# 1ファイル分のサイドバイサイド diff を出力する。
#   emit_file_diff <rel> <left-or-/dev/null> <right-or-/dev/null> <status>
# unified diff(git) を awk で2カラム化。HTMLエスケープは awk 内で行う。
emit_file_diff() {
  local rel="$1" left="$2" right="$3" status="$4"
  local relx; relx="$(html_escape "$rel")"
  local badge
  case "$status" in
    added)    badge='<span class="badge add">追加</span>' ;;
    deleted)  badge='<span class="badge del">削除</span>' ;;
    *)        badge='<span class="badge mod">変更</span>' ;;
  esac
  printf '<details class="file" open>\n<summary>%s <code>%s</code></summary>\n' "$badge" "$relx"

  # バイナリ判定（存在する側がテキストでなければ diff せず注記）
  local nontext=0
  [ "$left"  != "$EMPTY" ] && [ "$left"  != "/dev/null" ] && ! aidlc_is_text "$left"  && nontext=1
  [ "$right" != "$EMPTY" ] && [ "$right" != "/dev/null" ] && ! aidlc_is_text "$right" && nontext=1
  if [ "$nontext" -eq 1 ]; then
    printf '<p class="note">バイナリファイルのため内容差分の表示は省略します。</p>\n</details>\n'
    return 0
  fi

  printf '<table class="diff"><thead><tr><th class="ln"></th><th>前回取込 (base)</th><th class="ln"></th><th>上流新版</th></tr></thead><tbody>\n'
  git diff --no-index --no-color -U3 "$left" "$right" 2>/dev/null | awk '
    function esc(s){ gsub(/&/,"\\&amp;",s); gsub(/</,"\\&lt;",s); gsub(/>/,"\\&gt;",s); return s }
    function flush(   i,n,lc,rc,ll,rl){
      n = (ndel>nadd)?ndel:nadd
      for(i=1;i<=n;i++){
        if(i<=ndel){ lc="del"; ll=deln[i]; ld=esc(del[i]) } else { lc="empty"; ll=""; ld="" }
        if(i<=nadd){ rc="add"; rl=addn[i]; rd=esc(add[i]) } else { rc="empty"; rl=""; rd="" }
        printf "<tr><td class=\"ln\">%s</td><td class=\"%s\">%s</td><td class=\"ln\">%s</td><td class=\"%s\">%s</td></tr>\n", ll, lc, ld, rl, rc, rd
      }
      ndel=0; nadd=0
    }
    BEGIN{ ndel=0; nadd=0; inhunk=0; oldno=0; newno=0 }
    /^@@/ {
      flush()
      h=$0
      if(match(h,/-[0-9]+/)) oldno=substr(h,RSTART+1,RLENGTH-1)+0
      if(match(h,/\+[0-9]+/)) newno=substr(h,RSTART+1,RLENGTH-1)+0
      printf "<tr class=\"hunk\"><td colspan=\"4\">%s</td></tr>\n", esc(h)
      inhunk=1; next
    }
    inhunk==0 { next }                 # ファイルヘッダ(--- +++ diff index)はスキップ
    /^\\/ { next }                     # "\ No newline at end of file"
    /^-/ { deln[++ndel]=oldno; del[ndel]=substr($0,2); oldno++; next }
    /^\+/ { addn[++nadd]=newno; add[nadd]=substr($0,2); newno++; next }
    /^ / {
      flush()
      s=substr($0,2)
      printf "<tr><td class=\"ln\">%s</td><td class=\"ctx\">%s</td><td class=\"ln\">%s</td><td class=\"ctx\">%s</td></tr>\n", oldno, esc(s), newno, esc(s)
      oldno++; newno++; next
    }
    END{ flush() }
  ' || true
  printf '</tbody></table>\n</details>\n'
}

# --------------------------------------------------------------------------
# コミットログ（git があれば。distRoot と docs を対象に importedCommit..newCommit）
# --------------------------------------------------------------------------
COMMIT_LOG=""
if [ -d "$CLONE/.git" ]; then
  COMMIT_LOG="$(git -C "$CLONE" log --pretty=format:'%h%x09%an%x09%ad%x09%s' --date=short \
                "${IMPORTED}..${NEW_SHA}" -- "$DIST_ROOT" "$AIDLC_DOCS_SRC" 2>/dev/null || true)"
fi

# --------------------------------------------------------------------------
# HTML 生成
# --------------------------------------------------------------------------
{
cat <<HTML_HEAD
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>aidlc 更新レポート ${IMPORTED:0:12} → ${NEW_SHA:0:12}</title>
<style>
  :root{ --add:#e6ffec; --add-ln:#1a7f37; --del:#ffebe9; --del-ln:#cf222e;
         --ctx:#fff; --empty:#f6f8fa; --border:#d0d7de; --muted:#656d76; --hunk:#ddf4ff; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:0 0 4rem; font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif; color:#1f2328; background:#fff; }
  header.page{ padding:1.5rem 2rem; border-bottom:1px solid var(--border); background:#f6f8fa; }
  header.page h1{ margin:0 0 .5rem; font-size:1.3rem; }
  .meta{ color:var(--muted); font-size:.9rem; }
  .meta code{ background:#eaeef2; padding:.1em .4em; border-radius:4px; }
  .counts{ margin-top:.75rem; display:flex; gap:.5rem; flex-wrap:wrap; }
  .chip{ padding:.2em .7em; border-radius:999px; font-size:.85rem; font-weight:600; }
  .chip.add{ background:var(--add); color:var(--add-ln); }
  .chip.del{ background:var(--del); color:var(--del-ln); }
  .chip.mod{ background:#fff8c5; color:#7d4e00; }
  .chip.docs{ background:#eaeef2; color:var(--muted); }
  main{ padding:1.5rem 2rem; max-width:1400px; margin:0 auto; }
  section{ margin-bottom:2rem; }
  section h2{ font-size:1.1rem; border-bottom:2px solid var(--border); padding-bottom:.3rem; }
  .narrative{ background:#f6f8fa; border:1px solid var(--border); border-radius:8px; padding:1rem 1.25rem; }
  .narrative h2{ border:none; margin-top:0; }
  .placeholder{ color:var(--muted); font-style:italic; }
  table.log{ border-collapse:collapse; width:100%; font-size:.88rem; }
  table.log td{ padding:.25rem .6rem; border-bottom:1px solid var(--border); vertical-align:top; }
  table.log td.sha code{ color:var(--muted); }
  details.file{ border:1px solid var(--border); border-radius:8px; margin-bottom:1rem; overflow:hidden; }
  details.file>summary{ cursor:pointer; padding:.6rem 1rem; background:#f6f8fa; font-weight:600; user-select:none; }
  details.file>summary code{ font-weight:400; }
  .badge{ display:inline-block; padding:.05em .5em; border-radius:4px; font-size:.78rem; margin-right:.5rem; }
  .badge.add{ background:var(--add); color:var(--add-ln); }
  .badge.del{ background:var(--del); color:var(--del-ln); }
  .badge.mod{ background:#fff8c5; color:#7d4e00; }
  .note{ padding:.75rem 1rem; color:var(--muted); margin:0; }
  table.diff{ border-collapse:collapse; width:100%; font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; table-layout:fixed; }
  table.diff th{ text-align:left; padding:.3rem .6rem; background:#f6f8fa; border-bottom:1px solid var(--border); font-size:.8rem; color:var(--muted); }
  table.diff td{ padding:0 .6rem; white-space:pre-wrap; word-break:break-word; vertical-align:top; border-top:1px solid #eef1f4; }
  table.diff td.ln{ width:3.2rem; text-align:right; color:var(--muted); background:#f6f8fa; user-select:none; border-right:1px solid var(--border); }
  td.add{ background:var(--add); } td.del{ background:var(--del); }
  td.ctx{ background:var(--ctx); } td.empty{ background:var(--empty); }
  tr.hunk td{ background:var(--hunk); color:#0969da; font-size:.8rem; padding:.2rem .6rem; }
</style>
</head>
<body>
<header class="page">
  <h1>aidlc 更新レポート</h1>
  <div class="meta">
    ツール: <code>${TOOL}</code> ／ 差分: <code>${IMPORTED:0:12}</code> → <code>${NEW_SHA:0:12}</code> ／ 生成: ${GEN_AT}
  </div>
  <div class="counts">
    <span class="chip add">追加 ${#added[@]}</span>
    <span class="chip mod">変更 ${#modified[@]}</span>
    <span class="chip del">削除 ${#deleted[@]}</span>
    <span class="chip docs">参考docs(翻訳のみ) 追加 ${d_add} / 変更 ${d_mod} / 削除 ${d_del}</span>
  </div>
</header>
<main>

<section class="narrative">
  <h2>まとめ</h2>
  <!-- AIDLC:SUMMARY:START -->
  <p class="placeholder">（この枠は Claude が記入します：今回の上流更新の要点を 2〜4 行で。何が新しくなり、利用者にとっての意味は何かを平易に。）</p>
  <!-- AIDLC:SUMMARY:END -->
</section>

<section class="narrative">
  <h2>変更で何が起き、挙動がどう変わるか</h2>
  <!-- AIDLC:IMPACT:START -->
  <p class="placeholder">（この枠は Claude が記入します：主要な変更ファイルごとに、具体的にどんな挙動・設定・ワークフローが変わるのか。破壊的変更・新機能・自分のローカル変更への影響・衝突があればその手当を箇条書きで。）</p>
  <!-- AIDLC:IMPACT:END -->
</section>
HTML_HEAD

# コミットログ
if [ -n "$COMMIT_LOG" ]; then
  printf '<section>\n<h2>上流コミット (%s)</h2>\n<table class="log"><tbody>\n' "$(html_escape "$DIST_ROOT")"
  while IFS=$'\t' read -r sha author date subject; do
    [ -z "$sha" ] && continue
    printf '<tr><td class="sha"><code>%s</code></td><td>%s</td><td>%s</td><td>%s</td></tr>\n' \
      "$(html_escape "$sha")" "$(html_escape "$date")" "$(html_escape "$author")" "$(html_escape "$subject")"
  done <<< "$COMMIT_LOG"
  printf '</tbody></table>\n</section>\n'
fi

# diff 本体
printf '<section>\n<h2>変更内容（サイドバイサイド）</h2>\n'
if [ ${#added[@]} -eq 0 ] && [ ${#modified[@]} -eq 0 ] && [ ${#deleted[@]} -eq 0 ]; then
  printf '<p class="note">install 資産に内容差分はありません。</p>\n'
fi
# bash 3.2(macOS) は set -u 下で空配列の "${arr[@]}" 展開を unbound 扱いにするため
# ${arr[@]+...} で要素ごとの quoting を保ったままガードする。
for rel in ${modified[@]+"${modified[@]}"}; do emit_file_diff "$rel" "$BASE/$rel" "$THEIRS/$rel" "modified"; done
for rel in ${added[@]+"${added[@]}"};       do emit_file_diff "$rel" "$EMPTY"     "$THEIRS/$rel" "added";    done
for rel in ${deleted[@]+"${deleted[@]}"};   do emit_file_diff "$rel" "$BASE/$rel" "$EMPTY"       "deleted"; done
printf '</section>\n'

cat <<'HTML_FOOT'
</main>
</body>
</html>
HTML_FOOT
} > "$OUT"

aidlc_info ""
aidlc_info "=== HTML レポートを生成しました ==="
aidlc_info "  $OUT"
aidlc_info "  追加 ${#added[@]} / 変更 ${#modified[@]} / 削除 ${#deleted[@]}（参考docs: 追加 ${d_add} / 変更 ${d_mod} / 削除 ${d_del}）"
aidlc_info ""
aidlc_info "次に Claude が、レポート内の差し込み枠を解説で埋めます:"
aidlc_info "  <!-- AIDLC:SUMMARY:START --> .. :END   （まとめ）"
aidlc_info "  <!-- AIDLC:IMPACT:START -->  .. :END   （変更で何が起き挙動がどう変わるか）"
