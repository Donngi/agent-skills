# トラブルシューティング

`aidlc_status.sh --project-root "${PROJECT}"` がまず状況を教えてくれる。整合性・ローカル改変・
保留中 update・翻訳 todo を一覧できるので、迷ったら最初に実行する。

## 失敗モードと対処

### `manifest が見つかりません`
未 import の状態。`aidlc_import.sh` を実行する。逆に import 時に `既に manifest が存在します` と
出たら、それは update 対象。`aidlc_merge.sh` を使う。

### `成果物が見つかりません: <distRoot>`
取得したブランチに成果物が無い／ツール名が違う。`--branch v2` か、`--tool` が対応ツール（`kiro` /
`claude`）か確認する。kiro の dist は一時 clone 内でのビルド（`build.js`）で生成されるため、
ビルドが失敗していると成果物が無い状態になる（下記参照）。

### kiro 選択時に `kiro のビルドには node が必要です` / `kiro のビルドに失敗しました`
kiro は上流にソースのみがあり、取得した一時 clone 内で `node build/kiro-ide/build.js` を実行して
成果物を生成する。`node` が PATH に無い、または build.js がエラーになると停止する。対処:
- `node` を導入する（claude を取り込む場合は node 不要）。
- それでも解決しなければ、ビルド不要な `--tool claude` の利用を検討する。

### dirty で merge が停止する
`.kiro` / `.aidlc-sync` に未コミット変更があると、ロールバックの安全網が無いため停止する。
コミットか stash をしてから再実行。意図的に強行するなら `--force`（非推奨、戻せなくなる可能性）。

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
`aidlc_merge.sh --abort` で破棄してから操作する。abort は merge 直前の installPath を
`backup-<ts>/` から復元する。

### 旧構成の manifest で update が失敗する（`distRoot: dist/kiro/.kiro`）
上流 v2 が再構成され、旧パス `dist/kiro/.kiro` は存在しなくなった（kiro は `kiro/dist/kiro-ide/.kiro`、
claude は `claude-code/dist/claude/.claude`）。旧 manifest を持つ既存プロジェクトは diff/update 時に
`成果物が見つかりません` で停止する。対処:
- 再 import する（`.aidlc-sync/` を削除して `aidlc_import.sh --tool kiro` で取り込み直す）。
- もしくは manifest の `upstream.distRoot` を `kiro/dist/kiro-ide/.kiro` に手修正する。

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
