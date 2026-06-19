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
  ファイルパス、JSON キー、フェンスされたコードブロックは翻訳しない。
- **見出し構造・Markdown 記法・リンクは維持**。行数や箇条書きの対応関係を崩さない。
- **専門用語の統一**（下記の対訳表）。同じ語を文書間で揺らさない。
- 冒頭に「原文: <相対パス> / 上流コミット: <importedCommit 先頭12桁>」程度の出典メモを付けてよい
  （任意）。これは参考物なので可読性を優先する。

## 用語統一（対訳の目安）

| 原語 | 訳 |
|---|---|
| AI-DLC (AI-Driven Development Life Cycle) | AI駆動開発ライフサイクル（AI-DLC） |
| workflow | ワークフロー |
| skill | スキル |
| agent | エージェント |
| orchestrator | オーケストレーター |
| builder / validator | ビルダー / バリデーター |
| protocol | プロトコル |
| convention | 規約 |
| intent | インテント（意図） |
| unit | ユニット |
| requirement | 要件 |
| user story | ユーザーストーリー |
| functional design | 機能設計 |
| infrastructure design | インフラ設計 |
| reverse engineering | リバースエンジニアリング |
| wireframe | ワイヤーフレーム |
| validation spec | 検証仕様 |

固有名詞・新語で適切な定訳が無い場合は、初出に「日本語訳（原語）」の形で併記すると親切。

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
