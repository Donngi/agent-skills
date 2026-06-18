# manifest.json スキーマ

`${PROJECT}/.aidlc-sync/manifest.json` は同期状態の単一の真実。スクリプトが読み書きするので
手編集は避ける（壊れると `aidlc_status.sh` が整合性エラーを報告する）。

## フィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `schemaVersion` | number | スキーマ版。将来の拡張（複数ツール同時 vendoring 等）の互換判定用 |
| `upstream.repo` | string | 上流リポジトリ URL（既定 `https://github.com/awslabs/aidlc-workflows`） |
| `upstream.branch` | string | 取得ブランチ（既定 `v2`） |
| `upstream.distRoot` | string | 上流 repo 内の成果物ルート（claude: `dist/claude/.claude` / kiro: `dist/kiro/.kiro` / codex: `dist/codex`）。診断用の記録だが、diff/merge/finalize は実際には `tool` から再導出する（上流パス再編への self-heal）。finalize 時に最新値へ書き戻される |
| `tool` | string | 取り込んだツール名（`claude` / `kiro`(=Kiro CLI) / `codex`） |
| `installPath` | string | ターゲット内の配置先（既定 claude=`.claude` / kiro=`.kiro` / codex=`.`）。`files[].path` と `base/` はこの相対構造（codex は project root 相対で `.codex/...`・`.agents/...`） |
| `importedCommit` | string(40) | 現在取り込んでいる上流の full SHA。**差分の起点／冪等判定の鍵** |
| `importedAt` | string | 初回 import 時刻（ISO8601 UTC） |
| `lastUpdateCommit` | string\|null | 最後に finalize で確定した上流 SHA。未 update なら null |
| `updatedAt` | string | 最後の finalize 時刻（初回のみ無し） |
| `files[]` | array | 追跡対象ファイル一覧（= base の内容と一致） |
| `files[].path` | string | `installPath` 起点の相対パス |
| `files[].sha256` | string | baseの内容ハッシュ。ローカル改変検知・整合性検証に使う |
| `files[].mode` | string | パーミッション（記録のみ。強制はしない） |
| `files[].translatedSha256` | string? | md のみ。日本語訳の元にした原文ハッシュ。`!= sha256` なら訳が古い |
| `pendingUpdate` | object? | update 確定待ちのときだけ存在。finalize/abort で消える |
| `pendingUpdate.targetCommit` | string | 取り込もうとしている新上流 SHA |
| `pendingUpdate.startedAt` | string | merge 実行時刻 |
| `pendingUpdate.backup` | string | install 退避先（`.aidlc-sync/backup-<ts>` の相対パス。owned dirs を project-root 相対構造で保存） |
| `pendingUpdate.conflicts[]` | array | 衝突一覧 `{path, kind, detail}`。`kind` は merge/binary/delete-modified/delete-update/add-add |

## translatedSha256 の意味

- import 直後: 全 md に `translatedSha256` が無い → すべて翻訳対象。
- 翻訳後 `--mark-translated <path>`: `translatedSha256 = sha256` を記録。
- finalize: `files[]` を新 base から作り直すが、`translatedSha256` は **path 単位で旧値を引き継ぐ**。
  原文が変わった md は `sha256` が変わるので `translatedSha256 != sha256` となり、自動的に翻訳対象になる。
  変わっていない md は一致したままなので再翻訳されない（差分翻訳）。

`aidlc_status.sh --translation-todo` は `select((.translatedSha256 // "") != .sha256)` で対象を抽出する。

## 例

```json
{
  "schemaVersion": 1,
  "upstream": {
    "repo": "https://github.com/awslabs/aidlc-workflows",
    "branch": "v2",
    "distRoot": "dist/kiro/.kiro"
  },
  "tool": "kiro",
  "installPath": ".kiro",
  "importedCommit": "083bb3eae019a4bd00582bcb767a6cd37a3f5dfd",
  "importedAt": "2026-06-05T12:00:00Z",
  "lastUpdateCommit": "083bb3eae019a4bd00582bcb767a6cd37a3f5dfd",
  "updatedAt": "2026-06-05T12:30:00Z",
  "files": [
    { "path": "skills/aidlc-owasp/SKILL.md", "sha256": "…", "mode": "644", "translatedSha256": "…" },
    { "path": "agents/aidlc-builder-agent.json", "sha256": "…", "mode": "644" }
  ]
}
```

claude を取り込んだ場合は `upstream.distRoot` が `dist/claude/.claude`、`tool` が `claude`、
`installPath` が `.claude`（既定）になり、`files[].path` は `.claude/` 起点の相対パスになる。
codex の場合は `distRoot` が `dist/codex`、`installPath` が `.`（project root）になり、`files[].path`
は `.codex/...` と `.agents/...`（project root 相対）になる。
