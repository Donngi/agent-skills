# トラブルシューティング

`aidlc_status.sh --project-root "${PROJECT}"` がまず状況を教えてくれる。整合性・ローカル改変・
保留中 update・翻訳 todo を一覧できるので、迷ったら最初に実行する。

## 失敗モードと対処

### `manifest が見つかりません`
未 import の状態。`aidlc_import.sh` を実行する。逆に import 時に `既に manifest が存在します` と
出たら、それは update 対象。`aidlc_merge.sh` を使う。

### `成果物が見つかりません: <distRoot>`
取得したブランチに成果物が無い／ツール名が違う。`--branch v2` か、`--tool` が対応ツール
（`claude` / `kiro`(=Kiro CLI) / `codex`）か確認する。上流 v2 は全 dist をコミット済みのため、
通常はブランチ／ツール指定の取り違えが原因。

### dirty で merge が停止する
管理対象（claude なら `.claude`、kiro なら `.kiro`、codex なら `.codex`/`.agents`）や `.aidlc-sync`
に未コミット変更があると、ロールバックの安全網が無いため停止する。コミットか stash をしてから再実行。
意図的に強行するなら `--force`（非推奨、戻せなくなる可能性）。

### finalize が「未解決の衝突マーカーが残っています」で止まる
表示されたファイルに `<<<<<<<` / `>>>>>>>` が残っている。すべて解消してマーカー行を消す。
base は不変なので何度でも再試行できる。詳細は conflict-resolution.md。

### finalize が「マーカーを持たない衝突が記録されています」で止まる
delete-modified / delete-update / binary などマーカーの付かない衝突。内容を確認し、対処を決めてから
`--accept` を付けて再実行する。

### `base 改変(base破損)` / `base 欠落`（整合性エラー）
`.aidlc-sync/base/` が手で編集された、または一部が消えた。base が壊れると安全なマージができない。
復旧策:
- git 管理下なら `git checkout -- .aidlc-sync/base` で戻す。
- 戻せない場合は、`.aidlc-sync/` を削除して `aidlc_import.sh` で取り込み直す（ローカル変更は
  `installPath` 側に残っているので、import 先をクリーンにする必要がある点に注意）。

### 保留中 update が残ったまま別の操作をしたい
`aidlc_merge.sh --abort` で破棄してから操作する。abort は merge 直前の install（owned dirs）を
`backup-<ts>/` から復元する。

### 旧構成の manifest（古い `upstream.distRoot` が残っている）
上流 v2 はディレクトリ構成を再編し、現在の dist は `dist/claude/.claude` / `dist/kiro/.kiro` /
`dist/codex` にコミット済み（旧 `claude-code/dist/...` や `kiro/dist/kiro-ide/.kiro` は消滅）。
diff/merge/finalize は **manifest 保存値ではなく `tool` から distRoot を再導出**するため、古い
`distRoot` を持つ既存 manifest でもそのまま update でき（self-heal）、finalize 時に `distRoot` は
最新値へ書き戻される。手修正は不要。
- 旧 `tool: "kiro"`（旧 Kiro IDE）の install は、update すると Kiro CLI 版（`dist/kiro/.kiro`）へ
  移行する（いずれも `.kiro/` 配下のため install 先は変わらない）。意図が違う場合は再 import する。

### git が無い環境
`curl` + `tar` があれば codeload tarball で取得を試みる（ブランチ tip のみ・git ログ補助は無効）。
任意コミット指定や差分のコミットログは git が必要。可能なら git を入れる。

## 仕様上の制限（v1）

- **リネーム追跡なし**: 上流がファイルをリネームすると「旧パス削除＋新パス追加」として扱う。旧パスを
  ローカル改変していた場合は delete-modified 衝突＋新規追加の二重提示になる。意図を読んで手当てする。
- **複数ツールの同時 vendoring 非対応**: 1 つの `.aidlc-sync/` は単一 tool/installPath 前提。
  別ツールも入れたい場合は別プロジェクト、または将来の schemaVersion 拡張を待つ。
- **削除衝突で残したファイルは追跡外になる**: 上流削除をローカルで残すと、それは以後あなた独自の
  ファイルとして扱われる（base から消えるため manifest の追跡対象から外れる）。
- **CRLF/改行コード差**: 上流と異なる改行コードで保存すると偽の衝突要因になる。原則として上流の
  改行コードを保つ。
- **reference-ja はマージ対象外**: 訳はあくまで参考物。実利用ファイルではないので、訳を編集しても
  ワークフローの挙動は変わらない。
