#!/bin/bash
#
# validate_template.sh - テンプレートのフォーマット違反を機械的に検出するスクリプト
#
# Usage: validate_template.sh <template.tf> <resource_name> <schema.json>
#
# 全チェック項目を必ず実行し、違反項目を一覧表示する。
# 終了コード: 0=全PASS, 1=FAIL有り

set -uo pipefail
# Note: set -e は使わない（算術式の終了コードやgrep不一致で途中終了しないため）

TEMPLATE="$1"
RESOURCE_NAME="$2"
SCHEMA="$3"

FAIL_COUNT=0
PASS_COUNT=0

# 結果蓄積用
RESULTS=()

record_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  RESULTS+=("  ✅ PASS [$1] $2")
}

record_fail() {
  local check_id="$1"
  local summary="$2"
  shift 2
  FAIL_COUNT=$((FAIL_COUNT + 1))
  RESULTS+=("  ❌ FAIL [$check_id] $summary")
  for detail in "$@"; do
    RESULTS+=("           $detail")
  done
}

echo "=== Template Validation: $(basename "$TEMPLATE") ==="
echo ""

# --------------------------------------------------------------------------
# [1] ==== 区切り線の不在
# --------------------------------------------------------------------------
if grep -q '====' "$TEMPLATE"; then
  lines=$(grep -n '====' "$TEMPLATE" | head -5)
  record_fail "FR-2" "==== 区切り線が検出されました。#--- 形式を使用してください。" "$lines"
else
  record_pass "FR-2" "==== 区切り線なし"
fi

# --------------------------------------------------------------------------
# [2] 英語プレフィックス不在
# --------------------------------------------------------------------------
eng_prefixes=()
grep -qE '^\s*#\s*Description:' "$TEMPLATE" && eng_prefixes+=("Description:")
grep -qE '^\s*#\s*Valid values?:' "$TEMPLATE" && eng_prefixes+=("Valid values:")
grep -qE '^\s*#\s*Default:' "$TEMPLATE" && eng_prefixes+=("Default:")
grep -qE '^\s*#\s*Type:' "$TEMPLATE" && eng_prefixes+=("Type:")

if [ ${#eng_prefixes[@]} -gt 0 ]; then
  record_fail "FR-1/3" "英語プレフィックスが検出されました: ${eng_prefixes[*]}"
else
  record_pass "FR-1/3" "英語プレフィックス不在"
fi

# --------------------------------------------------------------------------
# [3] 日本語プレフィックス存在
# --------------------------------------------------------------------------
missing_jp=()
if ! grep -q '設定内容:' "$TEMPLATE"; then
  missing_jp+=("設定内容:")
fi
# 属性が3以上あるのに「設定可能な値」がない場合
if ! grep -qE '設定可能な値' "$TEMPLATE"; then
  attr_count=$(grep -cE '^\s+#\s+\S+\s+\((Optional|Required)' "$TEMPLATE" || true)
  if [ "$attr_count" -ge 3 ]; then
    missing_jp+=("設定可能な値:")
  fi
fi

if [ ${#missing_jp[@]} -gt 0 ]; then
  record_fail "FR-3" "日本語プレフィックスが不足しています: ${missing_jp[*]}"
else
  record_pass "FR-3" "日本語プレフィックス存在"
fi

# --------------------------------------------------------------------------
# [4] ヘッダー必須フィールド存在
# --------------------------------------------------------------------------
missing_header=()
grep -q 'Provider Version:' "$TEMPLATE" || missing_header+=("Provider Version:")
grep -q 'Generated:' "$TEMPLATE" || missing_header+=("Generated:")
grep -qE 'Terraform Registry:|registry\.terraform\.io' "$TEMPLATE" || missing_header+=("Terraform Registry:")
grep -q 'NOTE:' "$TEMPLATE" || missing_header+=("NOTE:")

if [ ${#missing_header[@]} -gt 0 ]; then
  record_fail "Header" "ヘッダー必須フィールドが不足: ${missing_header[*]}"
else
  record_pass "Header" "ヘッダー必須フィールド完備"
fi

# --------------------------------------------------------------------------
# [5] Attributes Reference セクション行数 ≤ 25行
# --------------------------------------------------------------------------
attr_ref_start=$(grep -n 'Attributes Reference' "$TEMPLATE" | head -1 | cut -d: -f1 || echo "")
if [ -n "$attr_ref_start" ]; then
  total_lines=$(wc -l < "$TEMPLATE" | tr -d ' ')
  # Attributes Reference開始行以降で最後の #--- 区切り線を探す
  attr_ref_end=$(tail -n +"$attr_ref_start" "$TEMPLATE" | grep -n '^#-\{3,\}' | tail -1 | cut -d: -f1 || echo "")
  if [ -n "$attr_ref_end" ]; then
    section_lines=$((attr_ref_end))
  else
    section_lines=$((total_lines - attr_ref_start + 1))
  fi
  if [ "$section_lines" -gt 25 ]; then
    record_fail "FR-6" "Attributes Referenceセクションが${section_lines}行です（上限25行）"
  else
    record_pass "FR-6" "Attributes Referenceセクション: ${section_lines}行"
  fi
else
  record_fail "FR-6" "Attributes Referenceセクションが見つかりません"
fi

# --------------------------------------------------------------------------
# [6] 使用例セクション不在
# --------------------------------------------------------------------------
example_patterns=()
if grep -qiE '^\s*#.*EXAMPLE' "$TEMPLATE"; then
  example_patterns+=("EXAMPLE")
fi
if grep -q '使用例' "$TEMPLATE"; then
  non_attr_examples=$(grep -n '使用例' "$TEMPLATE" | grep -v 'Attributes Reference' || true)
  if [ -n "$non_attr_examples" ]; then
    example_patterns+=("使用例")
  fi
fi
grep -q 'ベストプラクティス' "$TEMPLATE" && example_patterns+=("ベストプラクティス")

if [ ${#example_patterns[@]} -gt 0 ]; then
  record_fail "FR-7" "使用例/ベストプラクティスセクションが検出されました: ${example_patterns[*]}"
else
  record_pass "FR-7" "使用例セクション不在"
fi

# --------------------------------------------------------------------------
# [7] Required/Optionalグルーピングの不在
# --------------------------------------------------------------------------
if grep -qiE '^\s*#.*REQUIRED\s+(ARGUMENTS|PARAMETERS)' "$TEMPLATE" || \
   grep -qiE '^\s*#.*OPTIONAL\s+(ARGUMENTS|PARAMETERS)' "$TEMPLATE"; then
  record_fail "FR-4" "Required/Optionalグルーピングが検出されました。機能カテゴリ別にグルーピングしてください。"
else
  record_pass "FR-4" "Required/Optionalグルーピングなし"
fi

# --------------------------------------------------------------------------
# [8] 属性抜け漏れ検証
# --------------------------------------------------------------------------
if [ -f "$SCHEMA" ]; then
  # optional or required な属性のみ（computed onlyは除外）
  schema_attrs=$(jq -r ".provider_schemas[\"registry.terraform.io/hashicorp/aws\"].resource_schemas[\"${RESOURCE_NAME}\"].block.attributes // {} | to_entries[] | select(.value.optional == true or .value.required == true) | select((.value.computed == true and .value.optional != true) | not) | .key" "$SCHEMA" 2>/dev/null | sort)

  if [ -z "$schema_attrs" ]; then
    record_fail "Schema" "スキーマからリソース ${RESOURCE_NAME} の属性を取得できませんでした"
  else
    # テンプレートから属性名を抽出（代入行 + コメント内の属性名定義）
    template_attrs=$(grep -oE '^\s+#?\s*[a-z_]+\s+[=({]|^\s+[a-z_]+\s*=' "$TEMPLATE" | sed 's/[#=({].*//' | tr -d ' ' | sort -u)

    # Attributes Referenceに記載される属性（テンプレート本体には不要）
    # id, tags_all はcomputed属性としてAttributes Referenceに記載
    exclude_attrs="id tags_all"

    missing_attrs=""
    while IFS= read -r attr; do
      [ -z "$attr" ] && continue
      # 除外リストに含まれるものはスキップ
      echo "$exclude_attrs" | grep -qw "$attr" && continue
      echo "$template_attrs" | grep -qx "$attr" || missing_attrs="${missing_attrs} ${attr}"
    done <<< "$schema_attrs"

    if [ -n "$missing_attrs" ]; then
      record_fail "Schema" "スキーマに存在するがテンプレートに未記載の属性:${missing_attrs}"
    else
      record_pass "Schema" "全属性がテンプレートに存在"
    fi
  fi
else
  RESULTS+=("  ⏭️  SKIP [Schema] スキーマファイルが見つかりません: $SCHEMA")
fi

# --------------------------------------------------------------------------
# [9] ネストブロック抜け漏れ検証
# --------------------------------------------------------------------------
if [ -f "$SCHEMA" ]; then
  schema_blocks=$(jq -r ".provider_schemas[\"registry.terraform.io/hashicorp/aws\"].resource_schemas[\"${RESOURCE_NAME}\"].block.block_types // {} | keys[]" "$SCHEMA" 2>/dev/null | sort)

  if [ -n "$schema_blocks" ]; then
    missing_blocks=""
    while IFS= read -r block; do
      [ -z "$block" ] && continue
      grep -qE "(^|\s)${block}(\s|$|\s*\{|\s*-)" "$TEMPLATE" || missing_blocks="${missing_blocks} ${block}"
    done <<< "$schema_blocks"

    if [ -n "$missing_blocks" ]; then
      record_fail "Schema" "スキーマに存在するがテンプレートに未記載のブロック:${missing_blocks}"
    else
      record_pass "Schema" "全ネストブロックがテンプレートに存在"
    fi
  else
    record_pass "Schema" "ネストブロックなし"
  fi
else
  RESULTS+=("  ⏭️  SKIP [Schema] スキーマファイルが見つかりません: $SCHEMA")
fi

# --------------------------------------------------------------------------
# 結果一覧表示
# --------------------------------------------------------------------------
echo "--- 検証結果 ---"
for line in "${RESULTS[@]}"; do
  echo "$line"
done

echo ""
echo "=== Summary: ${PASS_COUNT} PASS, ${FAIL_COUNT} FAIL ==="

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
else
  exit 0
fi
