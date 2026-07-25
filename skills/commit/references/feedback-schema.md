# フィードバック・スキーマ（commit スキルのローカル記録様式）

`commit` スキルで見つけた不具合・改善点を、GitHub 未ログインの端末でも失わないよう**ローカルファイルに追記**するための様式。後日ユーザーが手動で回収し、リポジトリ側の改善に反映することを想定する。

## 記録先

- プロジェクト固有: `<git repo root>/.agent-skills/commit/feedback.md`
- 端末横断の一般的な改善点: `$HOME/.agent-skills/commit/feedback.md`

ディレクトリが無ければ作成し、ファイル末尾へ**追記**する（既存エントリは削除・改変しない）。

## コミットしない（.gitignore）

feedback は個人ローカルの記録であり**コミットしない**。ディレクトリ内に専用 `.gitignore`（中身は `feedback.md` の1行）を冪等配置して除外する。

- `.agent-skills/commit/.gitignore` の中身は `feedback.md` のみ。
- **overlay 系（`*.overlay.md`）は ignore しない** → チームで共有・コミット可能なまま残す。
- 除外の確認: `git check-ignore .agent-skills/commit/feedback.md` がヒットし、`commit-conventions.overlay.md` はヒットしないこと。

## エントリ様式

1 エントリ = 1 つの Markdown 見出しブロック。以下の項目を持つ。

```markdown
## <日時 ISO8601> — <種別> — <タイトル>

- 対象スキル: commit
- 端末: <hostname>
- プロジェクト: <git repo root か $PWD>
- 種別: bug | improvement | idea
- 重大度: low | medium | high
- 状態: new
- 詳細: <何が起きたか / どう改善したいか>
- 再現・文脈: <再現手順や、そう感じた状況。無ければ「-」>
```

### 各項目

| 項目 | 説明 |
|------|------|
| 日時 | `date '+%Y-%m-%dT%H:%M:%S%z'`（ISO8601） |
| タイトル | 1 行要約 |
| 対象スキル | 固定で `commit` |
| 端末 | `hostname` の出力 |
| プロジェクト | `git rev-parse --show-toplevel`（無ければ `$PWD`） |
| 種別 | `bug`（不具合） / `improvement`（既存の改善） / `idea`（新提案） |
| 重大度 | `low` / `medium` / `high` |
| 状態 | 記録時は `new`。回収・対応済みにしたら `triaged` に手動更新 |
| 詳細 | 本文。何が問題か、どう直したいか |
| 再現・文脈 | 再現手順やそう感じた状況。無ければ `-` |

## 記入例

```markdown
## 2026-07-22T21:40:11+0900 — bug — 分割提案が大きな差分で毎回出て煩わしい

- 対象スキル: commit
- 端末: donngi-mbp
- プロジェクト: /Users/donngi/work/acme-web
- 種別: bug
- 重大度: low
- 状態: new
- 詳細: 生成ファイル込みで差分が 300 行を超えると、論理的には 1 コミットでも毎回分割確認が入る。生成物は閾値から除外したい。
- 再現・文脈: `dist/` を含むコミットで再現。
```

## 運用メモ

- **勝手に大量記録しない**。ユーザーの申告時、または実行中に問題に当たり一言確認が取れたときだけ追記する。
- 回収は手動。ユーザーがこのファイルを開いて内容を GitHub Issue 等へ転記し、対応したエントリの状態を `triaged` に更新する。
