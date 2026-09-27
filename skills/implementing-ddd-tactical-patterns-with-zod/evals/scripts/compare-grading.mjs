#!/usr/bin/env node
// 採点役が書いた grading.json を、check.mjs の結果と照合する。
//
// 使い方:
//   node evals/scripts/compare-grading.mjs --grading <grading.json> --check <check.mjs の出力の JSON>
//
// 照合するもの:
//   - 〔スクリプト判定〕の項目で、check.mjs が true / false を返したものは、grading.json の passed が同じであること
//   - 印の無い項目でも、check.mjs が false（確実な違反）を返したものは、grading.json の passed が false であること
// check.mjs が null を返した項目は照合しない（採点役が判定する）。一覧を出すので、根拠が書いてあるかを確かめる。
// 食い違いが1件でもあれば非0で終わる。

import fs from "node:fs";

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		const value = argv[i + 1];
		if (!key?.startsWith("--") || value === undefined) {
			throw new Error(
				"使い方: node evals/scripts/compare-grading.mjs --grading <grading.json> --check <check.mjs の出力>",
			);
		}
		args[key.slice(2)] = value;
	}
	if (!args.grading || !args.check) {
		throw new Error("--grading と --check は必須です");
	}
	return args;
}

const SCRIPT_MARK = "〔スクリプト判定〕";
// 「[共通] [tag] …」または「[tag] …」の tag
const TAG = /^(?:\[共通\]\s*)?\[([a-z0-9-]+)\]/;

const args = parseArgs(process.argv.slice(2));
const grading = JSON.parse(fs.readFileSync(args.grading, "utf8"));
const check = JSON.parse(fs.readFileSync(args.check, "utf8"));
const byTag = new Map(check.results.map((r) => [r.tag, r]));

const mismatches = [];
const byGrader = [];
for (const e of grading.expectations ?? []) {
	const tag = e.text.match(TAG)?.[1];
	const r = tag ? byTag.get(tag) : undefined;
	if (!tag || !r) {
		if (tag && e.text.includes(SCRIPT_MARK)) {
			mismatches.push(`[${tag}] check.mjs の結果に無い`);
		}
		continue;
	}
	const marked = e.text.includes(SCRIPT_MARK);
	if (r.passed === null) {
		if (marked) {
			byGrader.push(
				`[${tag}] passed=${e.passed}（採点役の根拠: ${String(e.evidence ?? "").slice(0, 80)}）`,
			);
		}
		continue;
	}
	if ((marked || r.passed === false) && e.passed !== r.passed) {
		mismatches.push(
			`[${tag}] grading.json は ${e.passed}、check.mjs は ${r.passed}（${r.evidence.slice(0, 120)}）`,
		);
	}
}

process.stdout.write(
	`${JSON.stringify({ mismatches, decidedByGrader: byGrader }, null, 2)}\n`,
);
process.exit(mismatches.length > 0 ? 1 : 0);
