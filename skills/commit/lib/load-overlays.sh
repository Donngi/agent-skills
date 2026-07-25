#!/bin/bash
#
# load-overlays.sh - commit スキルのオーバーレイを解決して stdout に出力する
#
# オーバーレイは専用拡張子 .overlay.md の2系統:
#   - 差し替え(予約名 commit-conventions.overlay.md): 既定 references/commit-conventions.md の代わりに読む
#   - 追加(予約名以外の *.overlay.md)     : 必ず追加で読み込み、commit rule に append する
# 探索順は低優先→高優先（グローバル $HOME → プロジェクト git root）。両方あればプロジェクト優先。
# 出力は呼び出し側(モデル)が commit rule として解釈する。単体実行可能。
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
dirs=("$HOME/.agent-skills/commit" "$root/.agent-skills/commit")   # 低→高優先

# 1) 差し替え: commit-conventions.overlay.md があれば commit-conventions.md の代わり（プロジェクトが最優先）
rule=""
for d in "${dirs[@]}"; do
  [ -f "$d/commit-conventions.overlay.md" ] && rule="$d/commit-conventions.overlay.md"
done
if [ -n "$rule" ]; then
  echo "=== commit rule 差し替え: $rule ==="
  cat "$rule"
else
  echo "=== commit rule 既定: references/commit-conventions.md を使用 ==="
fi

# 2) 追加: commit-conventions.overlay.md 以外の *.overlay.md を全て（低→高優先）
for d in "${dirs[@]}"; do
  [ -d "$d" ] || continue
  find "$d" -maxdepth 1 -name '*.overlay.md' 2>/dev/null | sort | while IFS= read -r f; do
    [ "$(basename "$f")" = "commit-conventions.overlay.md" ] && continue
    echo "=== 追加オーバーレイ: $f ==="
    cat "$f"
  done
done
