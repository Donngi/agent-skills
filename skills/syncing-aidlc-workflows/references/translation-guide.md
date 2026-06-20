# 日本語訳ガイド

取り込んだ aidlc-workflows の **Markdown 文書のみ**を日本語訳し、`${PROJECT}/.aidlc-sync/reference-ja/`
に参考物として保存する。訳は人が AI-DLC ワークフローを理解するための補助であり、実利用ファイル
（`installPath` 配下）やマージには一切影響しない。

## 対象

- **訳す**: `.md` ファイル。次の 2 系統がある。
  1. **install 資産**（`files[]`）: 取り込んだハーネス成果物の Markdown（`SKILL.md`, `validation-spec.md`,
     `protocols/*.md`, `conventions/*.md`, `agents/*.md` 等）。
  2. **参考docs**（`docFiles[]`）: 上流 repo 直下 `docs/` の Markdown（`docs/guide/*`, `docs/reference/*`,
     `docs/harness-engineering/*`, `docs/README.md`）。AI-DLC のガイド/リファレンスで、`docs/...` のパスで出る。
     これらはインストールされず `base/docs/` にスナップショットされた参考専用ドキュメント。
- **訳さない**: `.json`（エージェント定義）, `.hook`, `.js` などの非 Markdown。機械可読な定義であり
  自然言語訳の価値が低く、誤訳が混乱を生むため。

対象の判定はスクリプトが行う（install 資産と参考docs の両方を返す）:

```bash
bash "${SKILL}/lib/aidlc_status.sh" --project-root "${PROJECT}" --translation-todo
```

**出力に出た md は 1 件残らず訳す**こと。件数が多くても（claude では計 200 件超になりうる）、
`--translation-todo` が空になるまで続ける。途中で打ち切らない。

## 原文は base を使う

翻訳の原文は必ず `${PROJECT}/.aidlc-sync/base/<相対パス>` を読む。
これは「最新上流の無改変版」であり、install 先のローカル変更が混ざっていない正規の原文。
install 先（`<installPath>/<相対パス>`）はローカル編集や衝突解消が入っている可能性があるため使わない。

## 出力先

`${PROJECT}/.aidlc-sync/reference-ja/<相対パス>` に、base と同じ相対構造で `Write` する。
例: 原文 `base/skills/aidlc-owasp/SKILL.md` → 訳 `reference-ja/skills/aidlc-owasp/SKILL.md`。
参考docs も同様: 原文 `base/docs/guide/00-introduction.md` → 訳 `reference-ja/docs/guide/00-introduction.md`
（`--translation-todo` が返す `docs/...` のパスをそのまま base/ と reference-ja/ に当てればよい）。

## 翻訳方針

- **意味の忠実さを最優先**。プロンプト/ルール文書なので、指示のニュアンス（MUST/SHOULD、手順の順序、
  条件分岐）を正確に保つ。
- **コード・識別子・パス・コマンドは原文のまま**。スキル名（`aidlc-orchestrator` 等）、フィールド名、
  ファイルパス、JSON キー、フェンスされたコードブロックは翻訳しない。Artifact の正準名（`scope-document`,
  `intent-statement` 等の kebab-case 識別子）もコードなので訳さない。
- **AI-DLC のドメイン固有名詞は訳さず原語のまま**にする。正準集合は原文の `base/docs/guide/glossary.md`
  の Term 列（`Workflow`, `Stage`, `Phase`, `Bolt`, `Orchestrator`, `Engine`, `Conductor`, `Agent`,
  `Skill`, `Rule`, `Sensor`, `Harness`, `Scope`, `Depth`, `Unit of work`, `Walking skeleton` など）。
  加えてフェーズ名（`Initialization` / `Ideation` / `Inception` / `Construction` / `Operation`）、
  スコープ名（`enterprise` / `feature` / `mvp` / `poc` / `bugfix` / `refactor` / `infra` /
  `security-patch` / `workshop`）も固有名詞として原語維持する。原文の表記（大文字小文字）に従う。
  - 必要なら**初出の 1 回だけ**「原語（参考訳）」の形で参考訳を併記してよい（例: `Intent（意図）`、
    `Unit of work（作業単位）`、`Walking skeleton（ウォーキングスケルトン）`）。2 回目以降は原語のみ。
    参考訳は読解の補助であって、固有名詞を置き換えるものではない。
  - **迷ったら訳さない**（原語を残す）方を選ぶ。glossary に載る語、および一目で AI-DLC 概念と分かる語は
    原語維持。下の「訳す」表にある一般技術用語だけを訳す。
- **見出し構造・Markdown 記法・リンクは維持**。行数や箇条書きの対応関係を崩さない。
- **一般技術用語の対訳を統一**（下記の対訳表）。同じ語を文書間で揺らさない。
- 冒頭に「原文: <相対パス> / 上流コミット: <importedCommit 先頭12桁>」程度の出典メモを付けてよい
  （任意）。これは参考物なので可読性を優先する。

## 用語統一（対訳の目安）

### 原語のまま残す（固有名詞）

訳さず原語のまま使う。**完全な正準集合は原文 `base/docs/guide/glossary.md` の Term 列に従う**こと
（下表は代表例のクイックリファレンス）。必要なら初出の 1 回だけ「原語（参考訳）」で参考訳を併記してよい。

| 原語 | 参考訳（初出のみ・任意） |
|---|---|
| AI-DLC (AI-Driven Development Life Cycle) | AI駆動開発ライフサイクル |
| Workflow | ワークフロー |
| Stage / Phase | ステージ / フェーズ |
| Bolt | （訳語なし・原語のまま） |
| Orchestrator / Engine / Conductor | オーケストレーター / エンジン / 指揮役 |
| Agent / Skill / Command | エージェント / スキル / コマンド |
| Rule / Sensor / Guardrail | ルール / センサー / ガードレール |
| Harness / Distribution / Core | ハーネス / 配布物 / コア |
| Scope / Depth | スコープ / 深さ |
| Unit of work | 作業単位 |
| Walking skeleton | ウォーキングスケルトン |
| Intent | 意図 |

フェーズ名（`Initialization` / `Ideation` / `Inception` / `Construction` / `Operation`）と
スコープ名（`enterprise` / `feature` / `mvp` / `poc` / `bugfix` / `refactor` / `infra` /
`security-patch` / `workshop`）も固有名詞として原語維持する。

### 訳す（一般技術用語）

AI-DLC 固有でない一般的な技術用語は訳し、対訳を統一する。

| 原語 | 訳 |
|---|---|
| convention | 規約 |
| requirement | 要件 |
| user story | ユーザーストーリー |
| functional design | 機能設計 |
| infrastructure design | インフラ設計 |
| reverse engineering | リバースエンジニアリング |
| wireframe | ワイヤーフレーム |
| validation spec | 検証仕様 |

## 訳の記録（重要）

各 md を訳して保存したら、必ず翻訳済みを記録する:

```bash
bash "${SKILL}/lib/aidlc_status.sh" --project-root "${PROJECT}" --mark-translated "<相対パス>"
```

これで manifest の `translatedSha256` が現在の原文ハッシュに更新され、`--translation-todo` から外れる。
記録しないと次回も「未翻訳」と判定され続ける。

## update 時の差分翻訳

finalize 後は、原文が変わった md だけが `--translation-todo` に出る（`translatedSha256 != sha256`）。
変わっていない md は再翻訳しない。上流で削除された md があれば、対応する `reference-ja/` の訳も削除してよい。
