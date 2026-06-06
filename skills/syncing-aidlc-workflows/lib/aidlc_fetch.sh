#!/bin/bash
#
# aidlc_fetch.sh - 上流(aidlc-workflows)を一時ディレクトリに取得する薄いCLI
#
# Usage:
#   aidlc_fetch.sh --dest <dir> [--repo <url>] [--branch <name>] [--commit <sha>]
#
# 成功時、解決した full SHA を stdout に1行出力する。
# import / merge は本スクリプトではなく aidlc_common.sh の関数を直接使う。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=aidlc_common.sh
source "$SCRIPT_DIR/aidlc_common.sh"

DEST=""
REPO="$AIDLC_DEFAULT_REPO"
BRANCH="$AIDLC_DEFAULT_BRANCH"
COMMIT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dest)   DEST="$2"; shift 2 ;;
    --repo)   REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    *) aidlc_die "不明な引数: $1" ;;
  esac
done

[ -n "$DEST" ] || aidlc_die "--dest は必須です"
[ -e "$DEST" ] && aidlc_die "--dest は存在しないパスを指定してください: $DEST"

aidlc_fetch_upstream "$DEST" "$REPO" "$BRANCH" "$COMMIT" \
  || aidlc_die "上流の取得に失敗しました"
