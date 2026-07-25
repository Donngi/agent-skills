# オーバーレイ・ガイド（commit スキルのカスタマイズ）

`commit` スキルは実行時に**オーバーレイ**（専用拡張子 `.overlay.md` のローカルファイル）を読み込み、端末・プロジェクトごとに挙動を変える。インストール済みスキル本体（`.claude/skills/commit/` 等、再インストールで上書きされる）は編集せず、外部ファイルでカスタマイズするための仕組み。

オーバーレイには**2系統**ある。

| 系統 | ファイル名 | 挙動 |
|------|-----------|------|
| **差し替え（replace）** | `commit-conventions.overlay.md`（予約名） | 既定の [commit-conventions.md](commit-conventions.md) の**代わりに**読まれる（完全置換） |
| **追加（additive）** | 予約名以外の `*.overlay.md` | **必ず追加**で読まれ、commit rule に append される（複数可） |

## 置き場所と優先順位

以下の**スキル別フォルダ**に置く（`gh skill install` で上書きされる場所の外なので、再インストールしても消えない）:

| スコープ | パス | 用途 |
|----------|------|------|
| プロジェクト（高優先） | `<git repo root>/.agent-skills/commit/` | そのリポジトリ専用 |
| グローバル（低優先） | `$HOME/.agent-skills/commit/` | その端末の全リポジトリ共通 |

- **差し替え**: 両スコープに `commit-conventions.overlay.md` があればプロジェクト側が採用される（1つだけ有効）。
- **追加**: 両スコープの `*.overlay.md` はすべて読まれる。矛盾時はプロジェクト側を優先。
- `commit-conventions.overlay.md` は予約名なので追加側には混ざらない（二重読み込みしない）。

## 差し替え: `commit-conventions.overlay.md`

commit rule を**丸ごと置き換える**。差分ではなく**完全な規約**を書く。既定 [commit-conventions.md](commit-conventions.md) をコピーして改変するのが出発点。

上書きしたくなる主な項目: Type の集合 / Scope の要否・語彙 / Subject の言語・形式 / Body の要否 / 分割の閾値 / フッター（チケット番号・sign-off 等）。

```markdown
# commit rule（プロジェクト: acme-web）— 既定を差し替え

## フォーマット
<type>(<scope>): <subject>

<body>

Refs: PROJ-<番号>

## Type
feat / fix / refactor / docs / test / chore / perf / style

## Scope
任意。付ける場合はディレクトリ名。

## Subject
- **英語**で記述（動詞原形始まり・先頭小文字・末尾ピリオドなし）
- 50文字以内

## Body
なぜ変更したかを記述。

## フッター
関連 Jira 番号を必ず付ける: `Refs: PROJ-<番号>`

## 分割
差分 500 行を目安に分割を検討。
```

## 追加: `*.overlay.md`（予約名以外）

既定の commit rule はそのまま使いつつ、**ルールを足す**用途。差分・追記スタイルで書く。用途ごとにファイルを分けてよい（例: `signoff.overlay.md`, `jira.overlay.md`）。

```markdown
# signoff.overlay.md（グローバル）— 追加ルール

- すべてのコミットに `Signed-off-by: 氏名 <メール>` を付与する（`git commit -s` 相当）。
```

```markdown
# jira.overlay.md（プロジェクト）— 追加ルール

- フッターに関連 Jira 番号を必ず付ける: `Refs: PROJ-<番号>`。
```

## 使い分けの目安

- 規約の骨格から作り替えたい → **差し替え**（`commit-conventions.overlay.md`）。
- 既定はおおむね良く、数点だけ足したい → **追加**（`*.overlay.md`）。

## 注意

- 安全側の注意事項（`--amend` / `--no-verify` / push を行わない）はオーバーレイでも上書きしない。
- 差し替えファイルに書き漏らした項目は「無し」として扱われる（既定にフォールバックしない）。完全な規約を書くこと。
