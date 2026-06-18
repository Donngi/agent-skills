#!/bin/bash
#
# aidlc_common.sh - syncing-aidlc-workflows 共通ライブラリ
#
# 各 lib スクリプトから source して使う。単体実行は想定しない。
# 決定論性のため、ファイル列挙は LC_ALL=C sort で順序固定する。

set -uo pipefail
# Note: set -e は使わない（grep不一致や算術式の終了コードで途中終了させないため）

# --------------------------------------------------------------------------
# デフォルト設定
# --------------------------------------------------------------------------
AIDLC_DEFAULT_REPO="https://github.com/awslabs/aidlc-workflows"
AIDLC_DEFAULT_BRANCH="v2"
AIDLC_DEFAULT_TOOL="kiro"
AIDLC_SYNC_DIR=".aidlc-sync"      # ターゲットrepo直下のメタデータディレクトリ名
AIDLC_SCHEMA_VERSION=1

# ツール名 → 上流repo内の成果物(dist)ルート
#   いずれもビルド済み成果物が上流にコミット済み（dist/<tool>/...）。そのまま取り込める。
#   claude : Claude Code        → dist/claude/.claude
#   kiro   : Kiro CLI           → dist/kiro/.kiro
#   codex  : Codex CLI          → dist/codex （配下に .codex/ と .agents/ の2ディレクトリ）
# 注: 旧 install の tool:"kiro" は旧 Kiro IDE 由来だが、現在は Kiro CLI を指す
#     （いずれも install 先は .kiro/）。update でそのまま Kiro CLI 版へ移行する。
aidlc_dist_root() {
  case "$1" in
    claude) echo "dist/claude/.claude" ;;
    kiro)   echo "dist/kiro/.kiro" ;;
    codex)  echo "dist/codex" ;;
    *)      return 1 ;;
  esac
}

# ツール名 → 既定の install-path（プロジェクト相対）
#   codex は .codex/ と .agents/ を project root 直下へ置くため "."（project root）。
aidlc_default_install_path() {
  case "$1" in
    claude) echo ".claude" ;;
    kiro)   echo ".kiro" ;;
    codex)  echo "." ;;
    *)      return 1 ;;
  esac
}

# clone 取得後に dist を用意する。
#   上流はすべての成果物をビルド済みでコミットしているため、ビルドは不要。
# aidlc_normalize_dist で「aidlc の動作に不要な内容」を除去するだけ。
# THEIRS（= $clone/$DIST_ROOT）を参照する前に呼ぶこと。import/diff/merge が
# いずれもこの正規化済み dist を base/ours/theirs の元にするため、3-way マージは一貫する。
aidlc_prepare_dist() {
  local clone="$1" tool="$2"
  local dist_root distdir
  dist_root="$(aidlc_dist_root "$tool")" || return 1
  distdir="$clone/$dist_root"
  aidlc_normalize_dist "$distdir" "$tool"
}

# dist から「aidlc の動作に必要でない内容」を除去する（取り込み前の正規化）。
#   claude : settings.json は aidlc の hooks 登録だけが動作に必要なので hooks のみ残す。
#            環境固有・グローバル設定（env の Bedrock/AWS_REGION/モデル指定、model、
#            effortLevel、statusLine、permissions、companyAnnouncements）はユーザーの
#            Claude Code 環境を上書きしてしまうため取り込まない。個人 override 例の
#            settings.local.json.example も同様に取り込まない。
#   codex  : distRoot(dist/codex) 直下の AGENTS.md は取り込み対象外なので除去
#            （.codex/ と .agents/ のみを取り込む）。
#   kiro   : 該当する全体設定ファイルが無いため no-op（AGENTS.md は distRoot 外）。
aidlc_normalize_dist() {
  local distdir="$1" tool="$2"
  case "$tool" in
    claude)
      local s="$distdir/settings.json"
      if [ -f "$s" ]; then
        local tmp; tmp="$(mktemp)" || return 1
        # hooks のみ残す（hooks 不在なら {} になる）
        if jq '{hooks} | with_entries(select(.value != null))' "$s" > "$tmp" 2>/dev/null; then
          mv "$tmp" "$s"
        else
          rm -f "$tmp"
          aidlc_warn "settings.json の正規化に失敗しました（そのまま取り込みます）: $s"
        fi
      fi
      rm -f "$distdir/settings.local.json.example"
      ;;
    codex)
      rm -f "$distdir/AGENTS.md"
      ;;
    *) : ;;
  esac
}

# --------------------------------------------------------------------------
# 出力ヘルパー
# --------------------------------------------------------------------------
aidlc_die()  { echo "ERROR: $*" >&2; exit 1; }
aidlc_warn() { echo "WARN: $*" >&2; }
aidlc_info() { echo "$*"; }

# --------------------------------------------------------------------------
# 依存コマンド確認
# --------------------------------------------------------------------------
aidlc_have() { command -v "$1" >/dev/null 2>&1; }

aidlc_require() {
  local missing=()
  local c
  for c in "$@"; do
    aidlc_have "$c" || missing+=("$c")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    aidlc_die "必須コマンドが見つかりません: ${missing[*]}"
  fi
}

# --------------------------------------------------------------------------
# ハッシュ・mode（macOS/Linux 両対応）
# --------------------------------------------------------------------------
aidlc_sha256() {
  if aidlc_have sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

aidlc_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null || echo "644"
}

# テキストファイル判定（バイナリは 3-way マージに渡さない）
aidlc_is_text() {
  local f="$1"
  [ -s "$f" ] || return 0           # 空ファイルはテキスト扱い
  LC_ALL=C grep -Iq . "$f"          # -I: バイナリは不一致扱い → 戻り値1
}

# --------------------------------------------------------------------------
# ファイル列挙（root配下の相対パス、順序固定）
# --------------------------------------------------------------------------
aidlc_list_rel() {
  local root="$1"
  [ -d "$root" ] || return 0
  ( cd "$root" && find . -type f | sed 's|^\./||' | LC_ALL=C sort )
}

# ツリーをまるごとコピー（dst側のディレクトリは都度作成）
# コピー失敗時は即座に非ゼロを返す（呼び出し側で || aidlc_die して部分コピーでの
# データ消失を防ぐこと）。
aidlc_copy_tree() {
  local src="$1" dst="$2" rel
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    mkdir -p "$dst/$(dirname "$rel")" || return 1
    cp "$src/$rel" "$dst/$rel" || return 1
  done < <(aidlc_list_rel "$src")
}

# --------------------------------------------------------------------------
# パス解決
# --------------------------------------------------------------------------
aidlc_manifest_path()   { echo "$1/$AIDLC_SYNC_DIR/manifest.json"; }       # $1=project root
aidlc_base_root()   { echo "$1/$AIDLC_SYNC_DIR/base"; }
aidlc_reference_ja_root(){ echo "$1/$AIDLC_SYNC_DIR/reference-ja"; }
aidlc_incoming_root()   { echo "$1/$AIDLC_SYNC_DIR/incoming"; }

# install が所有するトップレベル「項目」を project-root 相対で列挙する。
#   aidlc_owned_dirs <install_path> <source_root>
#   - install_path != "." → その値ひとつ（従来どおりの単一 install dir。例: .kiro）
#   - install_path == "." → source_root 直下の各項目（dir/ファイル）を列挙
#       （codex の .codex / .agents 等）。project root 自体は決して返さない。
# 粗い破壊的操作（backup/復元/rm -rf/dirty/grep）は必ずこの集合を明示対象にし、
# installPath="." のときに PROJECT_ROOT 自体を対象にしてしまう事故を防ぐ。
# source_root には現在の管理対象を表すツリー（BASE / THEIRS / backup 等）を渡す。
aidlc_owned_dirs() {
  local install_path="$1" source_root="$2"
  if [ "$install_path" != "." ]; then
    echo "$install_path"
    return 0
  fi
  [ -d "$source_root" ] || return 0
  ( cd "$source_root" && find . -mindepth 1 -maxdepth 1 | sed 's|^\./||' | LC_ALL=C sort )
}

# --------------------------------------------------------------------------
# 上流取得
#   aidlc_fetch_upstream <dest_dir> <repo> <branch> <commit-or-empty>
#   - dest_dir に clone し、解決した full SHA を stdout に出力
#   - commit 指定があればその SHA を checkout
#   - git が無ければ codeload tarball にフォールバック（branch tip のみ）
# --------------------------------------------------------------------------
aidlc_fetch_upstream() {
  local dest="$1" repo="$2" branch="$3" commit="${4:-}"

  if aidlc_have git; then
    if [ -n "$commit" ]; then
      # 任意 SHA を取得するため full clone（blobless）
      git clone --quiet --filter=blob:none --no-checkout "$repo" "$dest" >&2 \
        || { aidlc_warn "git clone に失敗: $repo"; return 1; }
      git -C "$dest" fetch --quiet origin "$commit" >&2 2>/dev/null || true
      git -C "$dest" checkout --quiet "$commit" >&2 \
        || { aidlc_warn "指定コミットの checkout に失敗: $commit"; return 1; }
    else
      git clone --quiet --depth 1 --branch "$branch" "$repo" "$dest" >&2 \
        || { aidlc_warn "git clone に失敗: $repo ($branch)"; return 1; }
    fi
    git -C "$dest" rev-parse HEAD
    return 0
  fi

  # --- git 非搭載時のフォールバック（GitHub の codeload tarball） ---
  aidlc_warn "git が見つかりません。tarball フォールバックを使用します（branch tip のみ・git diff補助は無効）。"
  aidlc_require curl tar
  # owner/repo を URL から抽出
  local slug
  slug="$(echo "$repo" | sed -E 's#^https?://github.com/##; s#\.git$##; s#/+$##')"
  [ -n "$slug" ] || { aidlc_warn "repo URL から owner/repo を抽出できません: $repo"; return 1; }
  local ref="${commit:-$branch}"
  # SHA 解決（API）。失敗しても tarball 自体は ref で取得を試みる
  local sha=""
  if [ -z "$commit" ]; then
    sha="$(curl -fsSL "https://api.github.com/repos/${slug}/commits/${branch}" 2>/dev/null \
            | sed -n 's/.*"sha": *"\([0-9a-f]\{40\}\)".*/\1/p' | head -1)"
  else
    sha="$commit"
  fi
  mkdir -p "$dest"
  curl -fsSL "https://codeload.github.com/${slug}/tar.gz/${ref}" 2>/dev/null \
    | tar -xz -C "$dest" --strip-components=1 \
    || { aidlc_warn "tarball 取得に失敗: $slug@$ref"; return 1; }
  echo "${sha:-$ref}"
}
