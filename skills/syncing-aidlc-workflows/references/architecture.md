# アーキテクチャ: なぜこの設計なのか

このスキルは、上流（AWS の `awslabs/aidlc-workflows`）の成果物を任意プロジェクトに**ベンダリング**し、
上流の更新を取り込む際に**ローカル変更を保持**することを目的とする。本質は「3-way マージによる同期」であり、
その正しさを支えるのが下記のメタデータ設計と不変条件である。

## 3つのディレクトリ

ターゲットプロジェクト `${PROJECT}` に以下が作られる。

```
${PROJECT}/
├── <installPath>/            # 既定 .kiro/。実利用ファイル = "ours"（ローカル変更込み）
└── .aidlc-sync/              # スキルが管理するメタデータ（コミット推奨）
    ├── manifest.json         # 同期状態の単一の真実
    ├── base/             # 前回取り込んだ無改変版 = 3-way マージの "base"
    ├── reference-ja/         # 取り込んだ Markdown の日本語訳（参考物・マージ対象外）
    ├── incoming/             # update 確定待ちの新上流（finalize で base になる・一時）
    └── backup-<ts>/          # merge 直前の installPath 退避（abort 用・一時）
```

## なぜ baseが必須か

3-way マージは 3 つの入力を要する。

- **base** = 共通の祖先 = 前回取り込んだ上流版
- **ours** = ローカルの現在ファイル（ユーザーが編集している）
- **theirs** = 新しい上流版

`ours` はユーザーが触っているので base には使えない。「前回上流から取り込んだそのままの版」を別に
保存しておく必要がある。それが `base/` である。base があるからこそ「上流が変えた行」と
「ローカルが変えた行」を区別でき、両者が別の場所なら自動マージ、同じ場所なら衝突として提示できる。

base が無い（base を消した/コミットし忘れた）と 3-way が成立せず、安全な更新ができない。
だから `.aidlc-sync/` はコミット推奨。

## 2フェーズ update の不変条件

update は `aidlc_merge.sh`（①）と `aidlc_finalize.sh`（②）に分かれる。鍵となる不変条件は：

> **baseは finalize で初めて新版へ進む。衝突が残っている間は進めない。**

理由: もし merge の時点で base を新上流に更新してしまうと、ユーザーが衝突解消を終える前に
base が ours より先へ進む。次にもう一度何かすると、base = 新上流・ours = 解消途中となり、
3-way の前提（base は共通祖先）が壊れて誤マージや過剰衝突を生む。

この不変条件のおかげで：

- **中断・再開**: merge 後に衝突を残したまま離席しても、base は旧版のまま。後で finalize すればよい。
- **ロールバック**: finalize 前なら `aidlc_merge.sh --abort` が正規の取り消し手段。install を
  `backup-<ts>/` から復元し、`pendingUpdate` と `incoming/` も破棄して元の状態へ戻す。
  （`git checkout -- <installPath>` は install 配下しか戻さず、manifest の `pendingUpdate` や
  `incoming/`・`backup-*/` は残るため、単独では完全な取り消しにならない点に注意。）
- **冪等な再試行**: finalize がマーカー残存で停止しても、base は不変なので何度でも再試行できる。

merge は新上流を `incoming/` に丸ごと保存しておき、finalize はそれを base に昇格させる。
こうすることで finalize 時に再ネットワーク取得が不要（オフラインでも確定できる）。

## 決定論性

- ファイル列挙は `find | LC_ALL=C sort` で順序固定。
- マージは `git merge-file` の確定的出力。同じ (base, ours, theirs) なら常に同じ結果・同じ衝突集合。
- 上流差分は base ↔ theirs の比較を主とし、git 履歴に依存しない（git ログは補助表示のみ）。

## 役割分担（スクリプト vs Claude）

- **スクリプト**: 取得・ハッシュ・ファイル分類・3-way マージ・整合性検証・manifest 更新（決定論的）。
- **Claude**: ツール選択、衝突マーカーの意味的な解決、日本語訳の生成（非決定論的な判断）。

翻訳をスクリプト化しないのは、良い訳は文脈依存の判断であり、決定論的処理に馴染まないため。
代わりにスクリプトは「どの md がいつ翻訳対象か」を `translatedSha256` で機械的に管理し、Claude に渡す。
