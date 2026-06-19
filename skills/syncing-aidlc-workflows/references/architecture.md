# アーキテクチャ: なぜこの設計なのか

このスキルは、上流（AWS の `awslabs/aidlc-workflows`）の成果物を任意プロジェクトに**ベンダリング**し、
上流の更新を取り込む際に**ローカル変更を保持**することを目的とする。本質は「3-way マージによる同期」であり、
その正しさを支えるのが下記のメタデータ設計と不変条件である。

取り込むハーネスは claude（Claude Code）/ kiro（Kiro CLI）/ codex（Codex CLI）から選べる。
上流 v2 は全ハーネスの成果物を `dist/<harness>/...` に**ビルド済みでコミット**しているため、
取り込みはこの dist をコピーするだけでよく、ビルドは行わない。取得後の同期ロジック
（base・3-way・finalize）はハーネス非依存である:

- **claude**: `dist/claude/.claude/` を `.claude/` へ取り込む。
- **kiro** (Kiro CLI): `dist/kiro/.kiro/` を `.kiro/` へ取り込む。
- **codex** (Codex CLI): `dist/codex/` を project root（installPath=`.`）へ取り込む。配下の
  `.codex/` と `.agents/` を配置する（`AGENTS.md` は正規化で除去）。

> 旧 v2 は kiro のみソースで一時 clone 内 `build.js` を要したが、上流再編で全 dist が
> コミット済みになり、ビルド依存（node）は廃止された。Kiro IDE（`dist/kiro-ide`）は本スキル対象外。

取得後はさらに **dist の正規化**（`aidlc_normalize_dist`）を行い、aidlc の動作に不要な内容を除去する。
claude の `settings.json` は aidlc の `hooks` 登録だけを残し、環境固有設定（`env` の Bedrock/リージョン/
モデル指定、`model`、`effortLevel`、`statusLine`、`permissions`、`companyAnnouncements`）と
`settings.local.json.example` を落とす。codex は dist 直下の `AGENTS.md` を落とす（`.codex/`・`.agents/`
のみ取り込む）。重要なのは、この正規化を **import / diff / merge のいずれもが
取得直後の一時 clone 上で同じく適用する**点である。これにより base（前回取込）・theirs（新上流）が
常に同じ規則で正規化され、3-way マージが「正規化前後の差」で誤検知することなく一貫する。

## 3つのディレクトリ

ターゲットプロジェクト `${PROJECT}` に以下が作られる。

```
${PROJECT}/
├── <installPath>/            # claude→.claude/、kiro→.kiro/。実利用ファイル = "ours"（ローカル変更込み）
│                             # codex は installPath="." で .codex/ と .agents/ を project root 直下に置く
└── .aidlc-sync/              # スキルが管理するメタデータ（コミット推奨）
    ├── manifest.json         # 同期状態の単一の真実（files[]=install資産 / docFiles[]=参考docs）
    ├── base/             # 前回取り込んだ無改変版 = 3-way マージの "base"
    │   └── docs/             # 上流 docs/ のスナップショット（参考専用・install/マージ対象外）
    ├── reference-ja/         # 取り込んだ Markdown の日本語訳（参考物・マージ対象外。docs/ も含む）
    ├── incoming/             # update 確定待ちの新上流 dist（finalize で base になる・一時）
    ├── incoming-docs/        # update 確定待ちの新上流 docs（finalize で base/docs になる・一時）
    └── backup-<ts>/          # merge 直前の install 退避（abort 用・一時。project-root 相対構造で保存）
```

### installPath="."（codex）と owned dirs

codex は `.codex/` と `.agents/` という 2 つの兄弟ディレクトリを project root 直下に置くため、
installPath は `.`（project root）になる。このとき backup / 復元 / dirty 判定 / マーカー検査などの
**粗い操作は project root 全体ではなく「所有トップレベル項目」(owned dirs) に限定**する
（`aidlc_common.sh` の `aidlc_owned_dirs`）。これにより `rm -rf "$PROJECT_ROOT/."` のような
プロジェクト全削除事故や、`.git` を巻き込んだ巨大 backup を防ぐ。owned dirs は管理対象ツリー
（base / 新上流 / backup）のトップレベル要素から導出する（codex なら `.codex` と `.agents`）。

### 参考docs（翻訳するがインストール/マージしない）

上流 repo 直下の `docs/`（AI-DLC のガイド/リファレンス）は、各ハーネスの dist_root
（claude なら `dist/claude/.claude`）の**外**にあるハーネス非依存の Markdown 群である。これは人が
ワークフローを理解するための読み物であり、実利用ファイルではない。そこで本スキルは docs を
**参考専用**として扱う:

- **install 先には配置しない**（ユーザーの `.claude/` 等を汚さない）。base 内 `base/docs/` にだけ
  スナップショットし、`reference-ja/docs/` に訳を置く。
- **3-way マージの対象にしない**。docs はローカル編集を前提としないため、ours/base/theirs の 3 者
  マージは不要。update 時は `incoming-docs/` に取得した新上流 docs で `base/docs/` を**まるごと差し替える**。
- manifest では install 資産の `files[]` とは別の **`docFiles[]`** で追跡する。これにより整合性検証・
  ローカル改変検知・3-way マージ（いずれも `files[]` 前提）に docs が一切干渉しない。
- 翻訳対象判定は `files[]` と同じ `translatedSha256 != sha256` ルール。`--translation-todo` は両者を
  まとめて返し、原文が変わった docs だけが update 後に再浮上する（差分翻訳）。

これは「base は install のミラー」という従来不変条件の**例外**にあたるが、`docFiles[]`/`base/docs/` を
install 系のロジックから切り離すことで、3-way の正しさには影響を与えない。

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
