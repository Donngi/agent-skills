#!/bin/bash
#
# record-feedback.sh - commit スキルの feedback 記録先を準備する
#
# .agent-skills/commit/ を用意し、feedback.md を除外する .gitignore を冪等配置し、
# 追記先パスとメタデータ(日時/端末/プロジェクト)を stdout に出力する。
# 実際のエントリ本文は呼び出し側(モデル)が references/feedback-schema.md に従って追記する。
#
# 使い方:
#   record-feedback.sh            # プロジェクト(git root)の .agent-skills/commit/ を対象
#   record-feedback.sh --global   # 端末横断: $HOME/.agent-skills/commit/ を対象
set -u

scope="project"
[ "${1:-}" = "--global" ] && scope="global"

root="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
if [ "$scope" = "global" ]; then
  dir="$HOME/.agent-skills/commit"
else
  dir="$root/.agent-skills/commit"
fi

mkdir -p "$dir"
# feedback.md を ignore する .gitignore を冪等配置（overlay 系はコミット可能なまま残す）
grep -qxF 'feedback.md' "$dir/.gitignore" 2>/dev/null || echo 'feedback.md' >> "$dir/.gitignore"

# 呼び出し側が使うパスとメタデータを出力
echo "FEEDBACK_FILE=$dir/feedback.md"
echo "DATE=$(date '+%Y-%m-%dT%H:%M:%S%z')"
echo "HOST=$(hostname)"
echo "PROJECT=$root"
