#!/usr/bin/env python3
"""evals.src.json から evals.json を生成する。

出力は skill-creator の evals.json の形式（id / prompt / expected_output / files / expectations）だけにする。
`files` はスキルのルートからの相対パス。保守用のキー（name / category / discriminative / test_subjects /
inherits / excludes）は evals.src.json にだけ置く。

共通の採点項目をプロファイルから展開し、ケース固有のものと連結する。
共通側には [共通] を前置して、viewer で区別できるようにする。すべての採点項目は同じ重みで数え、
合否はスキルありの構成で通過率が 100% かどうかで見る。
共通の採点項目の `{test_subjects}` はケースの test_subjects に、`{violations}` はレビューケースの
期待違反の一覧のパスに置き換える。

ケースの `excludes` に規則 ID を並べると、継承した assertion からそれを落とす。
そのケースで空虚に真になる assertion、およびケース固有の観測と同じ欠落を数える
assertion を配らないための仕組みで、落とす対象が継承側に無ければエラーにする
（規則 ID を変えたときに気づけるように）。

1つのケースに同じ規則 ID が2つ入っていてもエラーにする。文言だけ違う同じ ID が
別のプロファイルに入っていると、`excludes` で片方だけ落とせなくなるためである。

生成の前に、次の整合も検査する。どれも手で書き写すとずれたことがある箇所である。
- `files` に並べたファイルが実在する
- レビューケースの V / I / D の assertion の数が、expected-violations の一覧の行数と見出しの件数に一致する
- CASES.md の除外の表が、各ケースの `excludes` と一致する
- README.md のプロファイルの表の配布先が、各ケースの `inherits` と一致する

`--typecheck --node-modules <dir>` を付けると、各ケースの `files` だけを一時ディレクトリに写して
`tsc` を走らせる。渡したファイルが渡していないファイルを import していると、受験者が何を書いても
型検査が落ちるので、それを事前に止める。`<dir>` には example/package.json の依存（zod・typescript・
vitest・@types/node）を入れた node_modules を渡す。受験者に書かせるファイルを渡すファイルが
import しているケースは、`typecheck_stubs`（写し先 → 代役のファイル）で型検査のときだけ代役を置く。

採点スクリプト（スキル直下の scripts/check.mjs。書く側の自己確認と採点の両方で使う）について、いつも次を検査する。
- 〔スクリプト判定〕の印を付けた規則 ID のすべてに check.mjs の判定がある
- check.mjs の判定のすべてに、規則の要約と参照先（RULES）があり、参照先の見出しが実在する

読ませ方（SKILL.md「読む計画」）について、いつも次を検査する。対応表は maintenance/rule-map.json。
- 各ケースの reading_rows（保守用キー）が「読む計画」の表の行を指し、「常に読む」を含む
- 表のセルに節の指示（「…」）が無く、references のファイルがすべて表のどこかの行に出てくる
- 各 references の冒頭の読み方の表（testing.md・test-style.md・checklist.md）に節の指示が無い
- rule-map.json の rules が、evals の規則 ID と過不足なく対応し、書いたファイルが実在する
- 各ケースに配る規則の本文のファイルに、そのケースの reading_rows から届く（未到達0）
- moved の移し先の見出しが実在し、移し元の見出しが残っていない（moved_files はファイル単位）

`--check-script --node-modules <dir>` を付けると、check.mjs の自己テストを走らせる。
期待値は maintenance/checker-expectations.json にあり、次を確かめる。
- example に走らせて、false（確実な違反）が0件
- maintenance/checker-fixtures の正しい例・違反の例・決められない例が、期待どおり true / false / null になる
- fixtures の正しい見本と違反を仕込んだものが、期待どおりの規則だけを false にする
- --help・--files・--tsconfig が期待どおりに働く
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import tempfile

HERE = pathlib.Path(__file__).parent

ID_PATTERN = re.compile(r"^\[([a-z0-9-]+)\]")
SCRIPT_MARK = "〔スクリプト判定〕"
SKILL_ROOT = HERE.parent
CHECK_SCRIPT = SKILL_ROOT / "scripts" / "check.mjs"
REVIEW_ITEM = re.compile(r"^([VID])(\d+): ")


def assertion_id(assertion: str) -> str | None:
    matched = ID_PATTERN.match(assertion)
    return matched.group(1) if matched else None


def compress(ids: list[int]) -> str:
    """[1, 2, 3, 5, 7, 8] を 1〜3・5・7〜8 にする。"""
    runs: list[list[int]] = []
    for i in sorted(ids):
        if runs and runs[-1][-1] + 1 == i:
            runs[-1].append(i)
        else:
            runs.append([i])
    return "・".join(
        str(r[0]) if len(r) == 1 else f"{r[0]}〜{r[-1]}" for r in runs
    )


def check_files(case: dict) -> list[str]:
    paths = list(case["files"]) + list(case.get("typecheck_stubs", {}).values())
    return [
        f"{case['name']}: files のファイルが無い: {f}"
        for f in paths
        if not (HERE / f).is_file()
    ]


# example/tsconfig.json と同じ設定。fixture は example と同じ前提で書いてある
TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": True,
        "exactOptionalPropertyTypes": True,
        "noUncheckedIndexedAccess": True,
        "noImplicitReturns": True,
        "noImplicitOverride": True,
        "verbatimModuleSyntax": True,
        "noEmit": True,
        "skipLibCheck": True,
        "types": ["node", "vitest/importMeta"],
    },
    "include": ["**/*.ts"],
}


def typecheck_files(cases: list[dict], node_modules: pathlib.Path) -> list[str]:
    tsc = node_modules / ".bin" / "tsc"
    if not tsc.is_file():
        return [f"--typecheck: tsc が見つからない: {tsc}"]
    errors: list[str] = []
    for case in cases:
        if not any(f.endswith(".ts") for f in case["files"]):
            continue
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            # fixtures/ からの相対パスで写す。受験者が見る配置と同じにする
            copies = {f: f for f in case["files"]}
            for target, stub in case.get("typecheck_stubs", {}).items():
                copies[f"fixtures/{target}"] = stub
            for dst_rel, src_rel in copies.items():
                dst = root / pathlib.Path(dst_rel).relative_to("fixtures")
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(HERE / src_rel, dst)
            (root / "tsconfig.json").write_text(json.dumps(TSCONFIG), encoding="utf-8")
            (root / "node_modules").symlink_to(node_modules.resolve())
            result = subprocess.run(
                [str(tsc.resolve()), "-p", "tsconfig.json"],
                capture_output=True,
                text=True,
                cwd=root,
            )
            if result.returncode != 0:
                detail = result.stdout.strip().replace("\n", "\n    ")
                errors.append(f"{case['name']}: files だけでは型検査が通らない\n    {detail}")
    return errors


def check_review(case: dict) -> list[str]:
    errors: list[str] = []
    md_path = HERE / "expected-violations" / f"{case['name']}.md"
    if not md_path.is_file():
        return [f"{case['name']}: {md_path.name} が無い"]
    md = md_path.read_text(encoding="utf-8")
    violations = re.findall(r"^\| ([VI]\d+) \|", md, flags=re.M)
    decoys = re.findall(r"^\| (D\d+) \|", md, flags=re.M)
    heading = re.search(r"^## 期待する違反（(\d+)件）", md, flags=re.M)
    if heading is None or int(heading.group(1)) != len(violations):
        errors.append(
            f"{case['name']}: 期待違反の見出しの件数が一覧の行数（{len(violations)}）と違う"
        )
    asserted = [
        m.group(1) + m.group(2)
        for a in case["assertions"]
        if (m := REVIEW_ITEM.match(a))
    ]
    if sorted(asserted) != sorted(violations + decoys):
        errors.append(
            f"{case['name']}: assertion の番号 {sorted(asserted)} が一覧 {sorted(violations + decoys)} と違う"
        )
    for count_word in re.findall(r"の(\d+)件を挙げ", case["expected_output"]):
        if int(count_word) != len(violations):
            errors.append(
                f"{case['name']}: expected_output の件数 {count_word} が一覧の {len(violations)} と違う"
            )
    return errors


def check_cases_md(cases: list[dict]) -> list[str]:
    md = (HERE / "CASES.md").read_text(encoding="utf-8")
    table: dict[int, set[str]] = {}
    for line in md.splitlines():
        m = re.match(r"^\| (\d+) \| ((?:`[a-z0-9-]+` ?)+) \|", line)
        if m:
            table[int(m.group(1))] = set(re.findall(r"`([a-z0-9-]+)`", m.group(2)))
    actual = {c["id"]: set(c["excludes"]) for c in cases if c.get("excludes")}
    errors = []
    for cid in sorted(set(table) | set(actual)):
        if table.get(cid, set()) != actual.get(cid, set()):
            errors.append(
                f"CASES.md の除外の表と excludes が違う: {cid} 番 表={sorted(table.get(cid, set()))} excludes={sorted(actual.get(cid, set()))}"
            )
    return errors


def check_readme(profiles: dict, cases: list[dict]) -> list[str]:
    md = (HERE / "README.md").read_text(encoding="utf-8")
    table: dict[str, str] = {}
    for line in md.splitlines():
        m = re.match(r"^\| `([a-z-]+)` \| [^|]+ \| ([0-9〜・]+) \|$", line)
        if m:
            table[m.group(1)] = m.group(2)
    errors = []
    for name in profiles:
        ids = [c["id"] for c in cases if name in c.get("inherits", [])]
        expected = compress(ids)
        if table.get(name) != expected:
            errors.append(
                f"README.md のプロファイルの表が違う: {name} 表={table.get(name)} 実際={expected}"
            )
    for name in set(table) - set(profiles):
        errors.append(f"README.md のプロファイルの表に存在しないプロファイルがある: {name}")
    return errors


def headings(path: pathlib.Path) -> set[str]:
    return {
        m.group(1).strip()
        for m in re.finditer(r"^#{1,6} (.+)$", path.read_text(encoding="utf-8"), re.M)
    }


def check_script_rules(profiles: dict, cases: list[dict]) -> list[str]:
    """check.mjs の判定・要約と参照先（RULES）・evals.src.json の印が食い違っていないか。"""
    text = CHECK_SCRIPT.read_text(encoding="utf-8")
    checks_block = text[text.index("const checks = {") : text.index("\n};\n", text.index("const checks = {"))]
    check_tags = set(re.findall(r'^\t"?([a-z][a-z-]*)"?\(\) \{', checks_block, re.M))
    rules_block = text[text.index("const RULES = {") : text.index("\n};\n", text.index("const RULES = {"))]
    rule_tags = set(re.findall(r'^\t"?([a-z][a-z-]*)"?: \[', rules_block, re.M))
    errors = [f"check.mjs: {t} に RULES（要約と参照先）が無い" for t in sorted(check_tags - rule_tags)]
    errors += [f"check.mjs: RULES の {t} に判定が無い" for t in sorted(rule_tags - check_tags)]
    for target, heading in re.findall(r'"((?:SKILL\.md|references/[^"#]+))#([^"]+)"', rules_block):
        path = SKILL_ROOT / target
        if not path.is_file():
            errors.append(f"check.mjs: 参照先のファイルが無い: {target}")
        elif heading not in headings(path):
            errors.append(f"check.mjs: 参照先の見出しが無い: {target}#{heading}")
    assertions = [a for items in profiles.values() for a in items]
    assertions += [a for c in cases for a in c["assertions"]]
    marked = {assertion_id(a) for a in assertions if SCRIPT_MARK in a and assertion_id(a)}
    errors += [
        f"〔スクリプト判定〕の {t} に check.mjs の判定が無い" for t in sorted(marked - check_tags)
    ]
    known = {assertion_id(a) for a in assertions if assertion_id(a)}
    errors += [
        f"check.mjs の {t} に対応する規則 ID が evals.src.json に無い"
        for t in sorted(check_tags - known)
    ]
    return errors


READING_PLAN_HEADING = "### 読む計画"
REFERENCE_FILE = re.compile(r"`(references/[a-z0-9-]+\.md)`")


def reading_plan() -> dict[str, set[str]]:
    """SKILL.md の「読む計画」の表を、行の名前 → 読むファイル（example の列を除く）にする。"""
    text = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    section = text[text.index(READING_PLAN_HEADING) :]
    section = section[: section.index("\n#", len(READING_PLAN_HEADING))]
    rows: dict[str, set[str]] = {}
    for line in section.splitlines():
        if not line.startswith("| ") or line.startswith("| 行 ") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip("|").split(" | ")]
        rows[cells[0]] = set(REFERENCE_FILE.findall(" ".join(cells[1:4])))
    return rows


def check_reading_plan(cases: list[dict], case_rule_ids: dict[str, list[str]]) -> list[str]:
    """読む計画の表・rule-map.json・各ケースの reading_rows が噛み合っているか。"""
    errors: list[str] = []
    text = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    section = text[text.index(READING_PLAN_HEADING) :]
    table = [
        line for line in section[: section.index("\n#", len(READING_PLAN_HEADING))].splitlines()
        if line.startswith("| ") and not line.startswith("| 行 ")
    ]
    for line in table:
        if "「" in line:
            errors.append(f"SKILL.md「読む計画」の表に節の指示がある: {line[:60]}")
    rows = reading_plan()
    listed = set().union(*rows.values())
    for path in sorted((SKILL_ROOT / "references").glob("*.md")):
        rel = path.relative_to(SKILL_ROOT).as_posix()
        if rel not in listed:
            errors.append(f"SKILL.md「読む計画」の表に出てこない references がある: {rel}")
    for rel in sorted(listed):
        if not (SKILL_ROOT / rel).is_file():
            errors.append(f"SKILL.md「読む計画」の表のファイルが無い: {rel}")
    for name in ("testing.md", "test-style.md", "checklist.md"):
        head = (SKILL_ROOT / "references" / name).read_text(encoding="utf-8").split("\n## ", 1)[0]
        for line in head.splitlines():
            if line.startswith("| ") and "「" in line:
                errors.append(f"references/{name} の冒頭の読み方の表に節の指示がある: {line[:60]}")

    rule_map = json.loads((HERE / "maintenance" / "rule-map.json").read_text(encoding="utf-8"))
    rules: dict[str, list[str]] = rule_map["rules"]
    used = {i for ids in case_rule_ids.values() for i in ids}
    for rule in sorted(used - set(rules)):
        errors.append(f"rule-map.json に規則の本文のファイルが無い: {rule}")
    for rule in sorted(set(rules) - used):
        errors.append(f"rule-map.json にどのケースにも配っていない規則がある: {rule}")
    for rule, files in rules.items():
        for rel in files:
            if not (SKILL_ROOT / rel).is_file():
                errors.append(f"rule-map.json の {rule} のファイルが無い: {rel}")

    for case in cases:
        selected = case.get("reading_rows", [])
        if "常に読む" not in selected:
            errors.append(f"{case['name']}: reading_rows に「常に読む」が無い")
        unknown = [r for r in selected if r not in rows]
        if unknown:
            errors.append(f"{case['name']}: reading_rows に表に無い行がある: {unknown}")
        reachable = {"SKILL.md"}.union(*(rows.get(r, set()) for r in selected))
        for rule in case_rule_ids.get(case["name"], []):
            if rule in rules and not reachable.intersection(rules[rule]):
                errors.append(
                    f"{case['name']}: {rule} の本文（{', '.join(rules[rule])}）に reading_rows から届かない"
                )

    for moved in rule_map.get("moved", []):
        src_file, src_heading = moved["from"].split("#", 1)
        dst_file, dst_heading = moved["to"].split("#", 1)
        if dst_heading not in headings(SKILL_ROOT / dst_file):
            errors.append(f"rule-map.json の移し先の見出しが無い: {moved['to']}")
        if (SKILL_ROOT / src_file).is_file() and src_heading in headings(SKILL_ROOT / src_file):
            errors.append(f"rule-map.json の移し元に見出しが残っている: {moved['from']}")
    for moved in rule_map.get("moved_files", []):
        if not (SKILL_ROOT / moved["to"]).is_file():
            errors.append(f"rule-map.json の移し先のファイルが無い: {moved['to']}")
        if (SKILL_ROOT / moved["from"]).exists():
            errors.append(f"rule-map.json の移し元のファイルが残っている: {moved['from']}")
    return errors


def run_check(outputs: pathlib.Path, node_modules: pathlib.Path, *extra: str) -> dict:
    proc = subprocess.run(
        ["node", str(CHECK_SCRIPT), "--outputs", str(outputs), "--node-modules", str(node_modules), *extra],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"check.mjs が失敗した（{outputs}）:\n{proc.stderr}")
    return json.loads(proc.stdout)


def check_script(node_modules: pathlib.Path) -> list[str]:
    """check.mjs の自己テスト。期待値は maintenance/checker-expectations.json。"""
    expectations = json.loads(
        (HERE / "maintenance" / "checker-expectations.json").read_text(encoding="utf-8")
    )
    errors: list[str] = []

    example = run_check(SKILL_ROOT / "example", node_modules)
    wrong = [r["tag"] for r in example["results"] if r["passed"] is False]
    if wrong:
        errors.append(f"example で false になった: {wrong}")

    for item in expectations["checker"]:
        directory = HERE / "maintenance" / "checker-fixtures" / item["dir"]
        got = run_check(directory, node_modules, "--tags", ",".join(item["expect"]))
        for r in got["results"]:
            want = item["expect"][r["tag"]]
            if r["passed"] is not want:
                errors.append(
                    f"checker-fixtures/{item['dir']} の {r['tag']}: 期待 {want}、結果 {r['passed']}（{r['evidence'][:120]}）"
                )

    for item in expectations["fixtures"]:
        got = run_check(HERE / "fixtures" / item["dir"], node_modules)
        failed = sorted(r["tag"] for r in got["results"] if r["passed"] is False)
        if failed != sorted(item["false"]):
            errors.append(
                f"fixtures/{item['dir']} の false: 期待 {sorted(item['false'])}、結果 {failed}"
            )

    help_run = subprocess.run(["node", str(CHECK_SCRIPT), "--help"], capture_output=True, text=True)
    if help_run.returncode != 0 or "--files" not in help_run.stdout:
        errors.append("--help が使い方を表示しない")

    one = "domain/value-object/Timestamp.ts"
    narrowed = run_check(SKILL_ROOT / "example", node_modules, "--files", f"{one},no/such/file.ts")
    if narrowed["files"] != [one] or narrowed.get("missingFiles") != ["no/such/file.ts"]:
        errors.append(f"--files が判定するファイルを絞らない: {narrowed['files']} / {narrowed.get('missingFiles')}")

    unreliable = run_check(
        SKILL_ROOT / "example", node_modules, "--tsconfig", str(HERE / "no-such-tsconfig.json")
    )
    typed = {r["tag"]: r["passed"] for r in unreliable["results"]}
    if not unreliable.get("typeUnreliable") or typed.get("no-raw-error") is not None:
        errors.append("--tsconfig を読めないのに、型を使う判定を null にしていない")
    return errors

def main() -> None:
    parser = argparse.ArgumentParser(description="evals.src.json から evals.json を生成する")
    parser.add_argument(
        "--typecheck",
        action="store_true",
        help="各ケースの files だけで tsc が通るかも確かめる",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="evals.json を書き換えず、生成結果が既存の evals.json と違えば非0で終わる",
    )
    parser.add_argument(
        "--check-script",
        action="store_true",
        help="採点スクリプト（scripts/check.mjs）の自己テストを走らせる",
    )
    parser.add_argument(
        "--node-modules",
        type=pathlib.Path,
        help="--typecheck と --check-script で使う node_modules（example の依存を入れたもの）",
    )
    args = parser.parse_args()
    if (args.typecheck or args.check_script) and args.node_modules is None:
        raise SystemExit("--typecheck と --check-script には --node-modules が要る")

    src = json.loads((HERE / "evals.src.json").read_text(encoding="utf-8"))
    profiles = src["profiles"]

    # 継承されていないプロファイルも含めて、規則 ID の付け忘れを先に落とす
    all_ids: set[str] = set()
    for name, assertions in profiles.items():
        for a in assertions:
            rule = assertion_id(a)
            if rule is None:
                raise SystemExit(
                    f"プロファイル {name} の assertion に規則 ID が無い: {a}"
                )
            all_ids.add(rule)

    errors: list[str] = []
    case_rule_ids: dict[str, list[str]] = {}
    out = {"skill_name": src["skill_name"], "evals": []}
    for case in src["evals"]:
        common: list[str] = []
        for name in case.get("inherits", []):
            for a in profiles[name]:
                if a not in common:
                    common.append(a)
        # 重複の検査は excludes より前に置く。あとに置くと、文言だけ違う同じ ID を
        # 2つ継承したケースでも、その ID を excludes に書けば両方消えて検査を素通りする
        ids = [assertion_id(a) for a in common]
        duplicated = sorted({i for i in ids if ids.count(i) > 1})
        if duplicated:
            raise SystemExit(
                f"{case['name']}: 同じ規則 ID が2つ以上入っている: {duplicated}"
            )
        excludes = case.get("excludes", [])
        missing = [e for e in excludes if e not in set(ids)]
        if missing:
            raise SystemExit(
                f"{case['name']}: excludes に継承側で見つからない ID がある: {missing}"
            )
        common = [a for a in common if assertion_id(a) not in excludes]
        case_rule_ids[case["name"]] = [assertion_id(a) for a in common] + [
            rule for rule in (assertion_id(a) for a in case["assertions"]) if rule
        ]

        if case.get("test_subjects") and "test-core" not in case["inherits"]:
            raise SystemExit(
                f"{case['name']}: test_subjects があるのに test-core を継承していない"
            )
        if "test-core" in case["inherits"] and not case.get("test_subjects"):
            raise SystemExit(
                f"{case['name']}: test-core を継承しているのに test_subjects が無い"
            )
        replacements = {
            "{test_subjects}": "、".join(case.get("test_subjects", [])),
            "{violations}": f"evals/expected-violations/{case['name']}.md",
        }
        expectations = []
        for a in [f"[共通] {x}" for x in common] + list(case["assertions"]):
            for key, value in replacements.items():
                a = a.replace(key, value)
            if any(key in a for key in replacements):
                raise SystemExit(f"{case['name']}: 置き換えていない差し込みがある: {a}")
            expectations.append(a)

        built = {
            "id": case["id"],
            "prompt": case["prompt"],
            "expected_output": case["expected_output"],
            # skill-creator の files はスキルのルートからの相対パス
            "files": [f"evals/{f}" for f in case["files"]],
            "expectations": expectations,
        }
        errors += check_files(case)
        if case["category"] == "review":
            errors += check_review(case)
        out["evals"].append(built)

    errors += check_cases_md(src["evals"])
    errors += check_readme(profiles, src["evals"])
    errors += check_script_rules(profiles, src["evals"])
    errors += check_reading_plan(src["evals"], case_rule_ids)
    if args.typecheck:
        errors += typecheck_files(src["evals"], args.node_modules)
    if args.check_script:
        errors += check_script(args.node_modules)
    if errors:
        raise SystemExit("整合の検査で止めた:\n  " + "\n  ".join(errors))

    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    target = HERE / "evals.json"
    if args.check:
        current = target.read_text(encoding="utf-8") if target.is_file() else ""
        if current != text:
            raise SystemExit(
                "evals.json が evals.src.json の生成結果と違う。--check を外して作り直す"
            )
        print("evals.json は evals.src.json の生成結果と一致している")
        return
    target.write_text(text, encoding="utf-8")
    print(f"{len(out['evals'])} ケース")
    for case, e in zip(src["evals"], out["evals"]):
        print(f"  {e['id']:>2} {case['name']:<30} {len(e['expectations'])}件")


if __name__ == "__main__":
    main()
