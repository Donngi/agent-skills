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

# ツール名 → 上流repo内のビルド済み成果物ルート
aidlc_dist_root() {
  case "$1" in
    kiro) echo "dist/kiro/.kiro" ;;
    *)    return 1 ;;
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
