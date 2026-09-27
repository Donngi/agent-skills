#!/usr/bin/env node
// 採点項目のうち、構文を見れば誤りなく決まるものを判定する。
//
// 使い方は下の USAGE（`--help` で表示する）。
// 書き終えたコードを書く側が確かめるときと、evals の採点役が成果物を判定するときの両方で使う。
// 判定の定義は evals/README.md「スクリプトで判定する採点項目」にある。

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const USAGE = `使い方:
  node <スキルのディレクトリ>/scripts/check.mjs --outputs <dir> --node-modules <dir> [--files a,b,...] [--tsconfig <file>] [--work <dir>] [--tags a,b,...]
  node <スキルのディレクトリ>/scripts/check.mjs --help

--outputs       判定する成果物のディレクトリ（run の outputs/、またはプロジェクトのルート）。
                この中の TypeScript と vitest の設定だけを見る
--node-modules  typescript・zod・vitest・@types/node を入れた node_modules
--files         判定するファイルを、今回書いた・変えたファイルに絞る（--outputs からの相対パスをカンマで区切る）。
                省略すると --outputs の下のすべてを判定する。vitest の設定は絞らずに読む
--tsconfig      型を解決するときに使う tsconfig。プロジェクトで走らせるときに渡す。
                読めないとき、または判定するファイルの import が解決できないときは、型を使う判定を null にする
--work          型を解決するためのディレクトリ。evals の採点で、成果物と渡したファイルを複製した場所を渡す。
                省略すると --outputs を使う。判定するのは --outputs にあるファイルだけである
--tags          判定するタグを絞る（自己テストと evals の用途に限る）
--help          この説明を表示する

出力は JSON で、タグごとに { tag, passed, evidence, summary, ref } を並べる。
passed が false は確実な違反、true は規則の全体を満たしたこと、null はスクリプトでは決められなかったことを表す。
null の項目は、ref の見出しの規則を読んで確かめる（evals では採点役が判定する）。`;

// 値を取らない引数
const FLAGS = new Set(["help"]);

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i];
		if (!key.startsWith("--")) {
			throw new Error(`引数の形が違う: ${key}\n\n${USAGE}`);
		}
		const name = key.slice(2);
		if (FLAGS.has(name)) {
			args[name] = true;
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`${key} に値が無い\n\n${USAGE}`);
		}
		args[name] = value;
		i++;
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	process.stdout.write(`${USAGE}\n`);
	process.exit(0);
}
if (!args.outputs || !args["node-modules"]) {
	throw new Error(`--outputs と --node-modules は必須です\n\n${USAGE}`);
}
const outputsDir = path.resolve(args.outputs);
const workDir = path.resolve(args.work ?? args.outputs);
const nodeModules = path.resolve(args["node-modules"]);
const require = createRequire(path.join(nodeModules, "noop.js"));
const ts = require("typescript");

// -------------------------------------------------
// ファイルの分類
// -------------------------------------------------

const TS_FILE = /\.(c|m)?tsx?$/;
const TEST_FILE = /\.(test|spec)(-d)?\.(c|m)?tsx?$/;
const TYPE_TEST_FILE = /\.test-d\.(c|m)?tsx?$/;
const HELPER_FILE = /\.helper\.test\.(c|m)?tsx?$/;
const VITEST_CONFIG = /^(vitest|vite)\.config\.(c|m)?[tj]s$/;

function walk(dir) {
	const found = [];
	if (!fs.existsSync(dir)) {
		return found;
	}
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...walk(full));
		} else {
			found.push(full);
		}
	}
	return found;
}

const outputFiles = walk(outputsDir).map((f) => path.relative(outputsDir, f));

// --files で渡したファイルだけを判定する。--outputs に無いものは missingFiles に出す
const requestedFiles = args.files
	? args.files
			.split(",")
			.map((f) => f.trim())
			.filter((f) => f !== "")
			.map((f) => path.relative(outputsDir, path.resolve(outputsDir, f)))
	: undefined;
const missingFiles = (requestedFiles ?? []).filter(
	(f) => !outputFiles.includes(f),
);
const judgedRel = outputFiles.filter(
	(f) =>
		TS_FILE.test(f) &&
		!f.endsWith(".d.ts") &&
		!VITEST_CONFIG.test(path.basename(f)) &&
		(requestedFiles === undefined || requestedFiles.includes(f)),
);
const configRel = outputFiles.filter((f) =>
	VITEST_CONFIG.test(path.basename(f)),
);

const isTest = (rel) =>
	TEST_FILE.test(rel) || rel.split(path.sep).includes("__tests__");
const isTypeTest = (rel) => TYPE_TEST_FILE.test(rel);
const isHelper = (rel) => HELPER_FILE.test(rel);

// -------------------------------------------------
// プログラムの組み立て
// -------------------------------------------------

// 型を使う判定のために、--work のファイルをまとめて1つのプログラムにする。
// 判定するファイルは --work 側の同じ相対パスのものを使い、無ければ --outputs 側を使う
const workFiles = walk(workDir).filter(
	(f) => TS_FILE.test(f) && !VITEST_CONFIG.test(path.basename(f)),
);
const judgedAbs = judgedRel.map((rel) => {
	const inWork = path.join(workDir, rel);
	return fs.existsSync(inWork) ? inWork : path.join(outputsDir, rel);
});
// 型を信用できない理由。1つでもあれば、型を使う判定（TYPE_TAGS）を null にする
const typeUnreliable = [];

// evals の採点で使う既定の設定。--tsconfig を渡したときは、そのプロジェクトの設定を使う
const DEFAULT_OPTIONS = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	exactOptionalPropertyTypes: true,
	noEmit: true,
	skipLibCheck: true,
	typeRoots: [path.join(nodeModules, "@types")],
	types: ["node"],
	baseUrl: workDir,
	paths: { "*": [path.join(nodeModules, "*")] },
};

function projectOptions(tsconfigPath) {
	const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (read.error) {
		typeUnreliable.push(`tsconfig を読めない: ${tsconfigPath}`);
		return DEFAULT_OPTIONS;
	}
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		path.dirname(tsconfigPath),
	);
	if (parsed.errors.length > 0) {
		typeUnreliable.push(`tsconfig を解釈できない: ${tsconfigPath}`);
		return DEFAULT_OPTIONS;
	}
	return { ...parsed.options, noEmit: true, skipLibCheck: true };
}

const program = ts.createProgram({
	rootNames: [...new Set([...workFiles, ...judgedAbs])],
	options: args.tsconfig
		? projectOptions(path.resolve(args.tsconfig))
		: DEFAULT_OPTIONS,
});
const checker = program.getTypeChecker();
const sources = judgedRel.map((rel, i) => ({
	rel,
	sf: program.getSourceFile(judgedAbs[i]),
}));

// 判定するファイルの import が解決できないと、型から決める判定が誤る。そのときは型を使う判定を null にする
const UNRESOLVED_MODULE = new Set([2307, 2792]);
for (const s of sources) {
	for (const d of program.getSemanticDiagnostics(s.sf)) {
		if (UNRESOLVED_MODULE.has(d.code)) {
			typeUnreliable.push(
				`${s.rel}:${lineOf(s.sf, d.start ?? 0)} の import を解決できない`,
			);
		}
	}
}

// -------------------------------------------------
// 走査の補助
// -------------------------------------------------

function visit(node, fn) {
	fn(node);
	ts.forEachChild(node, (child) => visit(child, fn));
}

function lineOf(sf, pos) {
	return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function at(src, node) {
	return `${src.rel}:${lineOf(src.sf, node.getStart(src.sf))}`;
}

function unwrap(node) {
	let n = node;
	while (n && ts.isParenthesizedExpression(n)) {
		n = n.expression;
	}
	return n;
}

// テストの API を import する元。ここから import した名前は、別名でも元の名前として扱う
const TEST_MODULE = /^(vitest|@jest\/globals|node:test|bun:test)$/;
const TEST_API = new Set([
	"test",
	"it",
	"describe",
	"suite",
	"bench",
	"expect",
]);

// ファイルごとに、テストの API の別名（import { test as check }）と名前空間（import * as v）を集める。
// テストの API と同じ名前を別のモジュールから import していれば foreign に入れ、テストの API として扱わない
const testApiCache = new Map();
function testApi(sf) {
	if (testApiCache.has(sf)) {
		return testApiCache.get(sf);
	}
	const api = { alias: new Map(), namespaces: new Set(), foreign: new Set() };
	for (const st of sf.statements) {
		if (
			!ts.isImportDeclaration(st) ||
			!st.importClause ||
			!ts.isStringLiteral(st.moduleSpecifier)
		) {
			continue;
		}
		const fromTestModule = TEST_MODULE.test(st.moduleSpecifier.text);
		const bindings = st.importClause.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) {
			if (fromTestModule) {
				api.namespaces.add(bindings.name.text);
			}
			continue;
		}
		if (bindings && ts.isNamedImports(bindings)) {
			for (const el of bindings.elements) {
				const imported = (el.propertyName ?? el.name).text;
				if (fromTestModule && TEST_API.has(imported)) {
					api.alias.set(el.name.text, imported);
				} else if (TEST_API.has(el.name.text)) {
					api.foreign.add(el.name.text);
				}
			}
		}
	}
	testApiCache.set(sf, api);
	return api;
}

// callee の左端の識別子（test.for(...)(...) の test、expect(x).not.toThrow の expect）。
// テストの API は import の別名と名前空間を引き直して元の名前で返す（check(...) → test、v.test(...) → test）
function rootIdentifier(expr) {
	let n = expr;
	let firstProperty;
	for (;;) {
		if (ts.isCallExpression(n)) {
			n = n.expression;
		} else if (ts.isPropertyAccessExpression(n)) {
			firstProperty = n.name.text;
			n = n.expression;
		} else if (ts.isElementAccessExpression(n)) {
			firstProperty = undefined;
			n = n.expression;
		} else if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n)) {
			n = n.expression;
		} else {
			break;
		}
	}
	if (!ts.isIdentifier(n)) {
		return undefined;
	}
	const sf = n.getSourceFile();
	if (!sf) {
		return n.text;
	}
	const api = testApi(sf);
	if (api.namespaces.has(n.text)) {
		return firstProperty !== undefined && TEST_API.has(firstProperty)
			? firstProperty
			: undefined;
	}
	if (api.alias.has(n.text)) {
		return api.alias.get(n.text);
	}
	if (api.foreign.has(n.text)) {
		return undefined;
	}
	return n.text;
}

function calledName(call) {
	const callee = call.expression;
	if (ts.isPropertyAccessExpression(callee)) {
		return callee.name.text;
	}
	if (ts.isIdentifier(callee)) {
		return callee.text;
	}
	return undefined;
}

const isFunctionLike = (n) =>
	ts.isArrowFunction(n) ||
	ts.isFunctionExpression(n) ||
	ts.isFunctionDeclaration(n) ||
	ts.isMethodDeclaration(n);

// test(...) / test.for(...)(...) / it(...) の呼び出しと、そのテスト名・本体を取り出す
function testCalls(sf) {
	const found = [];
	visit(sf, (node) => {
		if (!ts.isCallExpression(node)) {
			return;
		}
		const root = rootIdentifier(node.expression);
		if (root !== "test" && root !== "it") {
			return;
		}
		// test.for(rows) のような途中の呼び出しは、外側の呼び出しで数える
		if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
			return;
		}
		const body = [...node.arguments].reverse().find((a) => isFunctionLike(a));
		const nameArg = node.arguments[0];
		const name =
			nameArg &&
			(ts.isStringLiteral(nameArg) ||
				ts.isNoSubstitutionTemplateLiteral(nameArg))
				? nameArg.text
				: undefined;
		found.push({ call: node, body, name });
	});
	return found;
}

function describeCalls(sf) {
	const found = [];
	visit(sf, (node) => {
		if (
			ts.isCallExpression(node) &&
			rootIdentifier(node.expression) === "describe"
		) {
			if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
				return;
			}
			const body = [...node.arguments].reverse().find((a) => isFunctionLike(a));
			if (body) {
				found.push({ call: node, body });
			}
		}
	});
	return found;
}

// expect(...) の呼び出し（import の別名・名前空間を含む）。expect(x).toBe の外側の呼び出しは含めない
function isExpectCall(call) {
	const callee = call.expression;
	const direct =
		ts.isIdentifier(callee) ||
		(ts.isPropertyAccessExpression(callee) &&
			ts.isIdentifier(callee.expression));
	return direct && rootIdentifier(callee) === "expect";
}

function containsExpect(node) {
	let hit = false;
	visit(node, (n) => {
		if (ts.isCallExpression(n) && isExpectCall(n)) {
			hit = true;
		}
	});
	return hit;
}

// コメントを取り出す。トークンごとに前後のコメントの範囲を集めるので、文字列やテンプレートの中は含まない
const commentCache = new Map();
function lineComments(sf) {
	if (commentCache.has(sf)) {
		return commentCache.get(sf);
	}
	const text = sf.getFullText();
	const ranges = new Map();
	const collect = (node) => {
		for (const r of [
			...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
			...(ts.getTrailingCommentRanges(text, node.end) ?? []),
		]) {
			ranges.set(r.pos, r);
		}
		for (const child of node.getChildren(sf)) {
			collect(child);
		}
	};
	collect(sf);
	const found = [...ranges.values()]
		.sort((x, y) => x.pos - y.pos)
		.map((r) => {
			const lineStart = text.lastIndexOf("\n", r.pos - 1) + 1;
			return {
				line: lineOf(sf, r.pos),
				text: text.slice(r.pos, r.end),
				block: r.kind === ts.SyntaxKind.MultiLineCommentTrivia,
				trailing: text.slice(lineStart, r.pos).trim() !== "",
			};
		});
	commentCache.set(sf, found);
	return found;
}

function isZodType(node) {
	const type = checker.getTypeAtLocation(node);
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
		return undefined;
	}
	const types = type.isUnion() ? type.types : [type];
	return types.some((t) => {
		const symbol = t.getSymbol() ?? t.aliasSymbol;
		return (symbol?.getDeclarations() ?? []).some((d) =>
			d.getSourceFile().fileName.includes(`${path.sep}zod${path.sep}`),
		);
	});
}

// -------------------------------------------------
// 判定
// -------------------------------------------------

const MAX_EVIDENCE = 10;

function result(tag, violations, note, undetermined = []) {
	if (violations.length > 0) {
		const shown = violations.slice(0, MAX_EVIDENCE).join("; ");
		const more =
			violations.length > MAX_EVIDENCE
				? ` ほか${violations.length - MAX_EVIDENCE}件`
				: "";
		return {
			tag,
			passed: false,
			evidence: `違反 ${violations.length}件: ${shown}${more}`,
		};
	}
	if (undetermined.length > 0) {
		return {
			tag,
			passed: null,
			evidence: `スクリプトでは決められない箇所がある（採点役が判定する）: ${undetermined.slice(0, MAX_EVIDENCE).join("; ")}`,
		};
	}
	return { tag, passed: true, evidence: note };
}

const testSources = () => sources.filter((s) => isTest(s.rel));
const implSources = () => sources.filter((s) => !isTest(s.rel));
const noTs = () => sources.length === 0;
const NO_TS = "適用外: TypeScript のファイルを出力していない";

const checks = {
	"no-cast"() {
		const v = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (ts.isAsExpression(n)) {
					const t = n.type;
					const isConst =
						ts.isTypeReferenceNode(t) &&
						ts.isIdentifier(t.typeName) &&
						t.typeName.text === "const";
					if (!isConst) {
						v.push(`${at(s, n)} as ${t.getText(s.sf)}`);
					}
				}
				// <T>expr の形も型アサーションである（.tsx 以外の .ts で書ける）
				if (ts.isTypeAssertionExpression(n)) {
					const t = n.type;
					const isConst =
						ts.isTypeReferenceNode(t) &&
						ts.isIdentifier(t.typeName) &&
						t.typeName.text === "const";
					if (!isConst) {
						v.push(`${at(s, n)} <${t.getText(s.sf)}>`);
					}
				}
			});
		}
		return result(
			"no-cast",
			v,
			noTs() ? NO_TS : "型アサーション（as 式と <T> 式。as const を除く）は0件",
		);
	},

	"no-nested-ternary"() {
		const v = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (!ts.isConditionalExpression(n)) {
					return;
				}
				for (
					let p = n.parent;
					p && !isFunctionLike(p) && !ts.isSourceFile(p);
					p = p.parent
				) {
					if (ts.isConditionalExpression(p)) {
						v.push(at(s, n));
						break;
					}
				}
			});
		}
		return result(
			"no-nested-ternary",
			v,
			noTs() ? NO_TS : "三項演算子の入れ子は0件",
		);
	},

	"comment-period"() {
		const HEADING = /^\/\/\s*(Given|When|Then|And):/;
		const v = [];
		for (const s of sources) {
			const comments = lineComments(s.sf).filter((c) => !c.block);
			// 行だけのコメントが続く範囲を1つのまとまりにする。コードの後ろのコメントは1行で1つ
			const groups = [];
			for (const c of comments) {
				const last = groups.at(-1);
				if (
					!c.trailing &&
					last &&
					!last.trailing &&
					last.lines.at(-1).line === c.line - 1
				) {
					last.lines.push(c);
				} else {
					groups.push({ trailing: c.trailing, lines: [c] });
				}
			}
			for (const g of groups) {
				const lines = g.lines.filter(
					(c) => !HEADING.test(c.text) && !c.text.startsWith("///"),
				);
				const lastLine = lines.at(-1);
				if (lastLine && lastLine.text.trimEnd().endsWith("。")) {
					v.push(`${s.rel}:${lastLine.line} ${lastLine.text.trim()}`);
				}
			}
		}
		return result(
			"comment-period",
			v,
			noTs() ? NO_TS : "最後の行が句点で終わる // コメントは0件",
		);
	},

	"no-default"() {
		const v = [];
		const unknown = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (
					!ts.isCallExpression(n) ||
					!ts.isPropertyAccessExpression(n.expression)
				) {
					return;
				}
				const name = n.expression.name.text;
				if (name !== "default" && name !== "prefault" && name !== "catch") {
					return;
				}
				const zod = isZodType(n.expression.expression);
				if (zod === true) {
					v.push(`${at(s, n)} .${name}()`);
				} else if (zod === undefined) {
					unknown.push(`${at(s, n)} .${name}()（受け手の型が解決できない）`);
				}
			});
		}
		return result(
			"no-default",
			v,
			noTs() ? NO_TS : "Zod の .default() / .prefault() / .catch() は0件",
			unknown,
		);
	},

	"jsdoc-tags"() {
		const TAG = /(^|\n)\s*\*?\s*@([A-Za-z]+)/g;
		const v = [];
		for (const s of sources) {
			for (const c of lineComments(s.sf)) {
				if (!c.block || !c.text.startsWith("/**")) {
					continue;
				}
				const body = c.text.replace(/^\/\*\*/, "").replace(/\*\/$/, "");
				for (const m of body.matchAll(TAG)) {
					const tag = m[2];
					if (tag !== "throws" && tag !== "deprecated") {
						v.push(`${s.rel}:${c.line} @${tag}`);
					}
				}
				for (const block of body
					.split(/(?=@throws\b)/)
					.filter((b) => b.startsWith("@throws"))) {
					const names = new Set(
						block.match(/\b[A-Z][A-Za-z0-9]*Error\b/g) ?? [],
					);
					if (names.size > 1) {
						v.push(
							`${s.rel}:${c.line} 1つの @throws に ${[...names].join("・")}`,
						);
					}
				}
			}
		}
		return result(
			"jsdoc-tags",
			v,
			noTs()
				? NO_TS
				: "@throws と @deprecated 以外のタグは0件で、@throws は1ブロックに1種類",
		);
	},

	"no-guard"() {
		const v = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (ts.isTypePredicateNode(n) && !n.assertsModifier) {
					v.push(`${at(s, n)} ${n.getText(s.sf)}`);
				}
			});
		}
		return result("no-guard", v, noTs() ? NO_TS : "型ガード（x is T）は0件");
	},

	"brand-symbol"() {
		const v = [];
		let count = 0;
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (!ts.isCallExpression(n) || calledName(n) !== "brand") {
					return;
				}
				count++;
				const t = n.typeArguments?.[0];
				const ok =
					t &&
					ts.isTypeQueryNode(t) &&
					ts.isIdentifier(t.exprName) &&
					isUniqueSymbolDeclared(s.sf, t.exprName.text);
				if (!ok) {
					v.push(
						`${at(s, n)} ${n.getText(s.sf).replace(/\s+/g, "").slice(-60)}`,
					);
				}
			});
		}
		// 宣言の仕方だけを見る。列挙・DTO・テストだけのファイルには .brand() が無いのが正しいので、
		// 0件は適用外にする。ブランドを付けるべき完成値に付けているかは採点項目 [brand-present] で見る
		if (!noTs() && count === 0) {
			return {
				tag: "brand-symbol",
				passed: true,
				evidence: "適用外: .brand() が無い",
			};
		}
		return result(
			"brand-symbol",
			v,
			noTs() ? NO_TS : `.brand() ${count}件すべてが unique symbol の typeof`,
		);
	},

	"brand-no-export"() {
		const v = [];
		for (const s of sources) {
			const symbols = uniqueSymbolDeclarations(s.sf);
			for (const d of symbols) {
				if (d.exported) {
					v.push(`${s.rel}:${d.line} ${d.name}`);
				}
			}
			visit(s.sf, (n) => {
				if (
					ts.isExportDeclaration(n) &&
					n.exportClause &&
					ts.isNamedExports(n.exportClause)
				) {
					for (const el of n.exportClause.elements) {
						const local = (el.propertyName ?? el.name).text;
						if (symbols.some((d) => d.name === local)) {
							v.push(`${at(s, n)} export { ${local} }`);
						}
					}
				}
			});
		}
		return result(
			"brand-no-export",
			v,
			noTs() ? NO_TS : "ブランドの unique symbol を export している箇所は0件",
		);
	},

	"brand-output"() {
		const v = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (ts.isCallExpression(n) && calledName(n) === "brand") {
					const second = n.typeArguments?.[1];
					if (second && second.getText(s.sf).includes("inout")) {
						v.push(
							`${at(s, n)} ${n.getText(s.sf).replace(/\s+/g, "").slice(-60)}`,
						);
					}
				}
			});
		}
		return result("brand-output", v, noTs() ? NO_TS : "inout のブランドは0件");
	},

	satisfies() {
		const v = [];
		const unknown = [];
		let calls = 0;
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (!ts.isCallExpression(n)) {
					return;
				}
				const name = calledName(n);
				if (name !== "safeParse" && name !== "safeParseAsync") {
					return;
				}
				calls++;
				const isZSafeParse =
					ts.isPropertyAccessExpression(n.expression) &&
					ts.isIdentifier(n.expression.expression) &&
					n.expression.expression.text === "z";
				const arg = unwrap(n.arguments[isZSafeParse ? 1 : 0]);
				if (
					arg &&
					ts.isObjectLiteralExpression(arg) &&
					arg.properties.some((p) => !ts.isSpreadAssignment(p))
				) {
					v.push(at(s, n));
				}
				if (
					arg &&
					ts.isSatisfiesExpression(arg) &&
					!/SchemaInput$/.test(arg.type.getText(s.sf))
				) {
					unknown.push(`${at(s, n)} satisfies ${arg.type.getText(s.sf)}`);
				}
			});
		}
		return result(
			"satisfies",
			v,
			calls === 0
				? "適用外: 実装のファイルで safeParse を呼んでいない"
				: `実装の safeParse ${calls}件で、キー付きのオブジェクトリテラルを satisfies なしで渡している箇所は0件`,
			unknown,
		);
	},

	"no-codec"() {
		const v = [];
		for (const s of sources) {
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					ts.isPropertyAccessExpression(n.expression) &&
					n.expression.name.text === "codec" &&
					ts.isIdentifier(n.expression.expression) &&
					n.expression.expression.text === "z"
				) {
					v.push(at(s, n));
				}
				if (
					ts.isImportDeclaration(n) &&
					n.moduleSpecifier.getText(s.sf).includes("zod") &&
					n.importClause?.namedBindings &&
					ts.isNamedImports(n.importClause.namedBindings)
				) {
					for (const el of n.importClause.namedBindings.elements) {
						if ((el.propertyName ?? el.name).text === "codec") {
							v.push(`${at(s, n)} import { codec }`);
						}
					}
				}
			});
		}
		return result("no-codec", v, noTs() ? NO_TS : "z.codec は0件");
	},

	"no-in-source"() {
		const v = [];
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (
					ts.isPropertyAccessExpression(n) &&
					n.name.text === "vitest" &&
					ts.isMetaProperty(n.expression)
				) {
					v.push(at(s, n));
				}
			});
		}
		return result(
			"no-in-source",
			v,
			noTs() ? NO_TS : "実装ファイルの import.meta.vitest は0件",
		);
	},

	"coverage-no-ignore"() {
		const v = [];
		for (const s of implSources()) {
			for (const c of lineComments(s.sf)) {
				if (/\b(v8|c8|istanbul)\s+ignore\b/.test(c.text)) {
					v.push(`${s.rel}:${c.line} ${c.text.trim().slice(0, 60)}`);
				}
			}
		}
		return result(
			"coverage-no-ignore",
			v,
			noTs() ? NO_TS : "製品コードの除外コメントは0件",
		);
	},

	"helper-not-imported"() {
		const v = [];
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (
					(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
					n.moduleSpecifier &&
					/\.helper\.test/.test(n.moduleSpecifier.getText(s.sf))
				) {
					v.push(`${at(s, n)} ${n.moduleSpecifier.getText(s.sf)}`);
				}
			});
		}
		return result(
			"helper-not-imported",
			v,
			noTs() ? NO_TS : "本番コードからヘルパーを import している箇所は0件",
		);
	},

	"helper-no-test"() {
		const helpers = sources.filter((s) => isHelper(s.rel));
		const v = [];
		for (const s of helpers) {
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					["test", "it", "describe", "suite", "bench"].includes(
						rootIdentifier(n.expression) ?? "",
					)
				) {
					if (ts.isCallExpression(n.parent) && n.parent.expression === n) {
						return;
					}
					v.push(at(s, n));
				}
			});
		}
		return result(
			"helper-no-test",
			v,
			helpers.length === 0
				? "適用外: ヘルパーが無い"
				: `ヘルパー ${helpers.length}ファイルにテストの登録は0件`,
		);
	},

	"helper-exclude"() {
		const helpers = sources.filter((s) => isHelper(s.rel));
		if (helpers.length === 0) {
			return {
				tag: "helper-exclude",
				passed: true,
				evidence: "適用外: ヘルパーが無い",
			};
		}
		if (configRel.length === 0) {
			return {
				tag: "helper-exclude",
				passed: false,
				evidence:
					"成果物に vitest の設定ファイルが無い。作業場所に vitest の設定（vitest.config.*・vite.config.* の test・workspace / projects）が無ければ、test.exclude に helper.test を入れた vitest.config.ts を新しく作れば消える（作ったことを回答に書く）。既存の設定を変えるときは、変える内容を示して利用者に確認する",
			};
		}
		const unknown = [];
		for (const rel of configRel) {
			const { found, dynamic } = configProperties(rel, "exclude");
			let opaque = dynamic;
			for (const prop of found) {
				// テストの収集に効くのは test.exclude だけ。coverage.exclude や typecheck.exclude は
				// ヘルパーをテストとして集めるかに関係しないので、合格の根拠にしない
				const owner = ownerPropertyName(prop);
				if (owner === "coverage" || owner === "typecheck") {
					continue;
				}
				if (owner !== "test") {
					opaque = true;
					continue;
				}
				const init = unwrap(prop.initializer);
				if (!ts.isArrayLiteralExpression(init)) {
					opaque = true;
					continue;
				}
				for (const el of init.elements) {
					if (
						(ts.isStringLiteral(el) ||
							ts.isNoSubstitutionTemplateLiteral(el)) &&
						/helper\.test/.test(el.text)
					) {
						return {
							tag: "helper-exclude",
							passed: true,
							evidence: `${rel} の exclude に ${el.text} がある`,
						};
					}
					if (!ts.isStringLiteral(el) && !isConfigDefaultsSpread(el)) {
						opaque = true;
					}
				}
			}
			if (opaque) {
				unknown.push(`${rel} の exclude を値として読めない`);
			}
		}
		return unknown.length > 0
			? {
					tag: "helper-exclude",
					passed: null,
					evidence: `スクリプトでは決められない（採点役が判定する）: ${unknown.join("; ")}`,
				}
			: {
					tag: "helper-exclude",
					passed: false,
					evidence: `${configRel.join("・")} の exclude に helper.test が無い。既存の設定を変えるときは、変える内容を示して利用者に確認する（ヘルパーの名前を変えて避けない）`,
				};
	},

	"type-test-config"() {
		const typeTests = sources.filter((s) => isTypeTest(s.rel));
		if (typeTests.length === 0) {
			return {
				tag: "type-test-config",
				passed: true,
				evidence: "適用外: 型のテストが無い",
			};
		}
		if (configRel.length === 0) {
			return {
				tag: "type-test-config",
				passed: false,
				evidence:
					"成果物に vitest の設定ファイルが無い。作業場所に vitest の設定（vitest.config.*・vite.config.* の test・workspace / projects）が無ければ、typecheck.enabled: true を入れた vitest.config.ts を新しく作れば消える（作ったことを回答に書く）。既存の設定を変えるときは、変える内容を示して利用者に確認する",
			};
		}
		const unknown = [];
		for (const rel of configRel) {
			const { found, dynamic } = configProperties(rel, "typecheck");
			let opaque = dynamic;
			for (const prop of found) {
				const init = unwrap(prop.initializer);
				if (!ts.isObjectLiteralExpression(init)) {
					opaque = true;
					continue;
				}
				const enabled = init.properties.find(
					(p) =>
						ts.isPropertyAssignment(p) &&
						propertyNameText(p.name) === "enabled",
				);
				if (init.properties.some((p) => ts.isSpreadAssignment(p))) {
					opaque = true;
				}
				if (!enabled) {
					continue;
				}
				const value = unwrap(enabled.initializer);
				if (value.kind === ts.SyntaxKind.TrueKeyword) {
					// include を書いていれば既定の収集対象が置き換わる。型のテストのファイルに当たると
					// 構文だけで言い切れるのは、すべての Xxx.test-d.ts に当たる形だけにする
					const include = init.properties.find(
						(p) =>
							ts.isPropertyAssignment(p) &&
							propertyNameText(p.name) === "include",
					);
					if (!include) {
						return {
							tag: "type-test-config",
							passed: true,
							evidence: `${rel} で typecheck.enabled が true（include は既定のまま）`,
						};
					}
					const patterns = stringArray(include.initializer);
					if (
						patterns?.some((x) =>
							/^\*\*\/\*\.test-d\.(ts|\{ts[^}]*\})$/.test(x),
						)
					) {
						return {
							tag: "type-test-config",
							passed: true,
							evidence: `${rel} で typecheck.enabled が true、include に ${patterns.join("・")}`,
						};
					}
					unknown.push(
						`${rel} の typecheck.include が型のテストのファイルに当たるかを決められない`,
					);
					continue;
				}
				if (value.kind !== ts.SyntaxKind.FalseKeyword) {
					opaque = true;
				}
			}
			if (opaque) {
				unknown.push(`${rel} の typecheck を値として読めない`);
			}
		}
		return unknown.length > 0
			? {
					tag: "type-test-config",
					passed: null,
					evidence: `スクリプトでは決められない（採点役が判定する）: ${unknown.join("; ")}`,
				}
			: {
					tag: "type-test-config",
					passed: false,
					evidence: `${configRel.join("・")} で typecheck.enabled: true が無い。既存の設定を変えるときは、変える内容を示して利用者に確認する`,
				};
	},

	"type-test-file"() {
		const v = [];
		for (const s of testSources().filter((x) => !isTypeTest(x.rel))) {
			for (const c of lineComments(s.sf)) {
				if (/@ts-expect-error/.test(c.text)) {
					v.push(`${s.rel}:${c.line} @ts-expect-error`);
				}
			}
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					ts.isIdentifier(n.expression) &&
					["expectTypeOf", "assertType"].includes(n.expression.text)
				) {
					v.push(`${at(s, n)} ${n.expression.text}`);
				}
			});
		}
		return result(
			"type-test-file",
			v,
			"実行時のテストファイルの @ts-expect-error は0件",
		);
	},

	"type-test-single"() {
		const v = [];
		let tests = 0;
		for (const s of testSources()) {
			const directives = lineComments(s.sf).filter((c) =>
				/@ts-expect-error/.test(c.text),
			);
			for (const t of testCalls(s.sf)) {
				if (!t.body) {
					continue;
				}
				const from = lineOf(s.sf, t.body.getStart(s.sf));
				const to = lineOf(s.sf, t.body.getEnd());
				const inside = directives.filter((d) => d.line >= from && d.line <= to);
				if (!isTypeTest(s.rel) && inside.length === 0) {
					continue;
				}
				tests++;
				if (inside.length !== 1) {
					v.push(`${at(s, t.call)} @ts-expect-error が${inside.length}個`);
				} else if (!/@ts-expect-error\s+\S/.test(inside[0].text)) {
					v.push(`${s.rel}:${inside[0].line} 何を止めているかが書いていない`);
				}
			}
		}
		return result(
			"type-test-single",
			v,
			tests === 0
				? "適用外: 型のテストが無い"
				: `型のテスト ${tests}件すべてに @ts-expect-error が1つで、説明がある`,
		);
	},

	"test-not-it"() {
		const v = [];
		for (const s of testSources()) {
			for (const t of testCalls(s.sf)) {
				if (rootIdentifier(t.call.expression) === "it") {
					v.push(at(s, t.call));
				}
			}
		}
		return result("test-not-it", v, "it の呼び出しは0件");
	},

	"no-not-tothrow"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					n.arguments.length === 0 &&
					ts.isPropertyAccessExpression(n.expression) &&
					["toThrow", "toThrowError"].includes(n.expression.name.text)
				) {
					const target = n.expression.expression;
					if (
						ts.isPropertyAccessExpression(target) &&
						target.name.text === "not"
					) {
						v.push(at(s, n));
					}
				}
			});
		}
		return result("no-not-tothrow", v, "引数なしの not.toThrow() は0件");
	},

	"strict-equal"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					ts.isPropertyAccessExpression(n.expression) &&
					n.expression.name.text === "toEqual"
				) {
					v.push(at(s, n));
				}
			});
		}
		return result("strict-equal", v, "toEqual は0件");
	},

	"table-for"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					ts.isPropertyAccessExpression(n) &&
					n.name.text === "each" &&
					["test", "it", "describe", "suite"].includes(rootIdentifier(n) ?? "")
				) {
					v.push(`${at(s, n)} ${n.getText(s.sf)}`);
				}
				// test.for の行が配列になっている
				if (
					ts.isCallExpression(n) &&
					ts.isPropertyAccessExpression(n.expression) &&
					n.expression.name.text === "for" &&
					["test", "it"].includes(rootIdentifier(n.expression) ?? "")
				) {
					const rows = unwrap(n.arguments[0]);
					if (
						rows &&
						ts.isArrayLiteralExpression(rows) &&
						rows.elements.some((e) => ts.isArrayLiteralExpression(unwrap(e)))
					) {
						v.push(`${at(s, n)} test.for の行がオブジェクトでない`);
					}
				}
			});
			// テストの中で expect を持つループ、describe の中でテストを登録するループ
			const loops = (root, test) =>
				visit(root, (n) => {
					const isLoop =
						ts.isForStatement(n) ||
						ts.isForOfStatement(n) ||
						ts.isForInStatement(n) ||
						ts.isWhileStatement(n) ||
						ts.isDoStatement(n) ||
						(ts.isCallExpression(n) && calledName(n) === "forEach");
					if (isLoop && test(n)) {
						v.push(`${at(s, n)} ループ`);
					}
				});
			for (const t of testCalls(s.sf)) {
				if (t.body) {
					loops(t.body, containsExpect);
				}
			}
			for (const d of describeCalls(s.sf)) {
				loops(d.body, (n) => {
					let registers = false;
					visit(n, (m) => {
						if (
							ts.isCallExpression(m) &&
							["test", "it"].includes(rootIdentifier(m.expression) ?? "")
						) {
							registers = true;
						}
					});
					return registers && !containsExpectOutsideTests(n);
				});
			}
		}
		return result(
			"table-for",
			[...new Set(v)],
			"test.each・行が配列の test.for・ケースを検証するループは0件",
		);
	},

	"test-order"() {
		const RANK = { "正常系:": 0, "異常系:": 1, "不変性:": 2 };
		const v = [];
		for (const s of testSources()) {
			const groups = new Map();
			for (const t of testCalls(s.sf)) {
				const owner = enclosingDescribe(t.call);
				if (!groups.has(owner)) {
					groups.set(owner, []);
				}
				const prefix = Object.keys(RANK).find((p) => t.name?.startsWith(p));
				if (prefix) {
					groups.get(owner).push({ t, rank: RANK[prefix] });
				}
			}
			for (const list of groups.values()) {
				if (new Set(list.map((x) => x.rank)).size < 2) {
					continue;
				}
				for (let i = 1; i < list.length; i++) {
					if (list[i].rank < list[i - 1].rank) {
						v.push(`${at(s, list[i].t.call)} ${list[i].t.name}`);
					}
				}
			}
		}
		return result(
			"test-order",
			v,
			"正常系 → 異常系 → 不変性 の順に並んでいない describe は0件",
		);
	},

	gwt() {
		const HEAD = /^\/\/\s*(Given|When|Then|And):(.*)$/;
		const v = [];
		let tests = 0;
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			const comments = lineComments(s.sf).filter((c) => !c.block);
			const text = s.sf.getFullText();
			const lines = text.split("\n");
			for (const t of testCalls(s.sf)) {
				if (!t.body) {
					continue;
				}
				tests++;
				const from = lineOf(s.sf, t.body.getStart(s.sf));
				const to = lineOf(s.sf, t.body.getEnd());
				const heads = comments
					.filter((c) => c.line >= from && c.line <= to)
					.map((c) => ({ line: c.line, m: c.text.trim().match(HEAD) }))
					.filter((h) => h.m);
				const order = heads.filter((h) => h.m[1] !== "And").map((h) => h.m[1]);
				const where = at(s, t.call);
				if (order.join(",") !== "Given,When,Then") {
					v.push(`${where} 見出しが ${order.join("→") || "無い"}`);
					continue;
				}
				for (const h of heads) {
					if (h.m[2].trim() === "") {
						v.push(`${s.rel}:${h.line} // ${h.m[1]}: の説明が無い`);
					}
				}
				const thenLine = heads.find((h) => h.m[1] === "Then").line;
				for (const h of heads.filter((x) => x.m[1] === "And")) {
					if (h.line < thenLine) {
						v.push(`${s.rel}:${h.line} Given か When の中に // And:`);
					} else if ((lines[h.line - 2] ?? "").trim() === "") {
						v.push(`${s.rel}:${h.line} // And: の前に空行`);
					}
				}
			}
		}
		return result(
			"gwt",
			v,
			tests === 0
				? "適用外: テストが無い"
				: `テスト ${tests}件すべてに Given → When → Then の見出しと説明がある`,
		);
	},

	"mock-name"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					ts.isVariableDeclaration(n) &&
					n.initializer &&
					ts.isIdentifier(n.name)
				) {
					const init = unwrap(n.initializer);
					if (
						ts.isCallExpression(init) &&
						createsMock(init) &&
						!n.name.text.startsWith("mock")
					) {
						v.push(`${at(s, n)} ${n.name.text}`);
					}
				}
			});
		}
		return result("mock-name", v, "mock で始まらないモックの変数は0件");
	},

	"await-rejects"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					!ts.isPropertyAccessExpression(n) ||
					(n.name.text !== "rejects" && n.name.text !== "resolves")
				) {
					return;
				}
				if (rootIdentifier(n) !== "expect") {
					return;
				}
				// 連なった呼び出しの外側まで上がり、await の対象かを見る
				let top = n;
				while (
					top.parent &&
					(ts.isPropertyAccessExpression(top.parent) ||
						(ts.isCallExpression(top.parent) &&
							top.parent.expression === top) ||
						ts.isParenthesizedExpression(top.parent))
				) {
					top = top.parent;
				}
				if (!ts.isAwaitExpression(top.parent)) {
					v.push(at(s, n));
				}
			});
		}
		return result("await-rejects", v, "await の無い rejects / resolves は0件");
	},

	"error-message-owned"() {
		const v = [];
		const unknown = [];
		const classes = [];
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (ts.isClassDeclaration(n) && n.name) {
					classes.push({ s, n });
				}
			});
		}
		// 成果物の中で、ほかの class に継承されている class（基底・中間）
		const parents = new Set();
		for (const { n } of classes) {
			const parent = extendsTarget(n);
			if (parent.decl) {
				parents.add(parent.decl);
			}
		}
		for (const { s, n } of classes) {
			const name = n.name.text;
			const parent = extendsTarget(n);
			if (
				isAbstractClass(n) ||
				name === "FatalUnreachableError" ||
				(parent.builtin && parents.has(n))
			) {
				continue;
			}
			const source = messageSource(n);
			if (source.kind === "param") {
				const param = effectiveConstructor(n)?.parameters[source.index];
				v.push(
					`${at(s, n)} ${name}（${param ? `引数 ${param.name.getText(s.sf)} ` : "受け継いだコンストラクタ"}から文を受け取る）`,
				);
			} else if (source.kind === "unknown") {
				unknown.push(`${at(s, n)} ${name}: ${source.why}`);
			}
		}
		return result(
			"error-message-owned",
			v,
			noTs()
				? NO_TS
				: "呼び出し側から文を受け取る業務のエラーの具象 class は0件",
			unknown,
		);
	},

	"error-fatal-shape"() {
		const v = [];
		let found = 0;
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (
					!ts.isClassDeclaration(n) ||
					n.name?.text !== "FatalUnreachableError"
				) {
					return;
				}
				found++;
				const parent = extendsTarget(n);
				if (!(parent.builtin && parent.name === "Error")) {
					v.push(`${at(s, n)} Error を直接継承していない`);
				}
				const ctor = n.members.find(ts.isConstructorDeclaration);
				const hasIssues =
					n.members.some(
						(m) =>
							(ts.isPropertyDeclaration(m) || ts.isGetAccessorDeclaration(m)) &&
							m.name.getText(s.sf) === "issues",
					) ||
					(ctor?.parameters ?? []).some(
						(p) =>
							ts.canHaveModifiers(p) &&
							(ts.getModifiers(p) ?? []).length > 0 &&
							p.name.getText(s.sf) === "issues",
					);
				if (hasIssues) {
					v.push(`${at(s, n)} issues を持っている`);
				}
				const receivesUnknown = (ctor?.parameters ?? []).some(
					(p) => p.type?.kind === ts.SyntaxKind.UnknownKeyword,
				);
				if (!receivesUnknown) {
					v.push(`${at(s, n)} cause を unknown で受けていない`);
				}
			});
		}
		return result(
			"error-fatal-shape",
			v,
			noTs()
				? NO_TS
				: found === 0
					? "適用外: FatalUnreachableError を定義していない"
					: "FatalUnreachableError は Error を直接継承し、issues を持たず、cause を unknown で受けている",
		);
	},

	"error-shared-no-model-import"() {
		const v = [];
		let found = 0;
		for (const s of implSources()) {
			if (path.basename(s.rel) !== "shared-errors.ts") {
				continue;
			}
			found++;
			for (const st of s.sf.statements) {
				if (
					(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
					st.moduleSpecifier &&
					ts.isStringLiteral(st.moduleSpecifier)
				) {
					const spec = st.moduleSpecifier.text;
					if (spec !== "zod" && !spec.startsWith("zod/")) {
						v.push(`${at(s, st)} ${spec} を import している`);
					}
				}
			}
		}
		return result(
			"error-shared-no-model-import",
			v,
			found === 0
				? "適用外: shared-errors.ts が無い"
				: "shared-errors.ts が import しているのは zod だけ",
		);
	},

	"no-raw-error"() {
		const v = [];
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				if (!ts.isThrowStatement(n) || !n.expression) {
					return;
				}
				const e = unwrap(n.expression);
				if (
					ts.isStringLiteral(e) ||
					ts.isNoSubstitutionTemplateLiteral(e) ||
					ts.isTemplateExpression(e)
				) {
					v.push(`${at(s, n)} 文字列を throw している`);
					return;
				}
				if (
					(ts.isNewExpression(e) || ts.isCallExpression(e)) &&
					ts.isIdentifier(e.expression) &&
					isBuiltinErrorConstructor(e.expression)
				) {
					v.push(`${at(s, n)} ${e.expression.text} を throw している`);
				}
			});
		}
		return result(
			"no-raw-error",
			v,
			noTs() ? NO_TS : "組み込みの Error や文字列を throw している箇所は0件",
		);
	},

	// ---------- 規則の全体を構文で決めるもの ----------

	"caught-position"() {
		const v = [];
		let tries = 0;
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (!ts.isTryStatement(n) || !n.catchClause) {
					return;
				}
				const caughtName = catchTarget(n.catchClause);
				if (!caughtName) {
					return;
				}
				tries++;
				const block = n.parent;
				const statements =
					block && (ts.isBlock(block) || ts.isSourceFile(block))
						? block.statements
						: undefined;
				const index = statements ? statements.indexOf(n) : -1;
				const previous = index > 0 ? statements[index - 1] : undefined;
				const declared =
					previous &&
					ts.isVariableStatement(previous) &&
					previous.declarationList.declarations.some(
						(d) => ts.isIdentifier(d.name) && d.name.text === caughtName,
					);
				if (!declared) {
					v.push(`${at(s, n)} ${caughtName} の宣言が try の直上に無い`);
				}
			});
		}
		return result(
			"caught-position",
			v,
			tries === 0
				? "適用外: 例外を変数に受ける try が無い"
				: `例外を変数に受ける try ${tries}件すべての直上に、その変数の宣言がある`,
		);
	},

	"test-file-place"() {
		const v = [];
		const unknown = [];
		let files = 0;
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			files++;
			const base = path.basename(s.rel);
			if (s.rel.split(path.sep).includes("__tests__")) {
				v.push(`${s.rel} が __tests__ の下にある`);
				continue;
			}
			if (/\.spec(-d)?\.(c|m)?tsx?$/.test(base)) {
				v.push(`${s.rel} が .spec の名前になっている`);
				continue;
			}
			const stem = base.replace(/\.test(-d)?\.(c|m)?tsx?$/, "");
			const dir = path.dirname(s.rel);
			const sibling = [".ts", ".tsx", ".mts", ".cts"].some((ext) => {
				const rel = path.join(dir, `${stem}${ext}`);
				return (
					fs.existsSync(path.join(outputsDir, rel)) ||
					fs.existsSync(path.join(workDir, rel))
				);
			});
			if (!sibling) {
				unknown.push(
					`${s.rel}（同じ場所に ${stem}.ts が無く、対象を決められない）`,
				);
			}
		}
		return result(
			"test-file-place",
			v,
			files === 0
				? "適用外: テストが無い"
				: `テストのファイル ${files}件すべてが、対象の横に Xxx.test.ts / Xxx.test-d.ts の名前で置かれている`,
			unknown,
		);
	},

	"test-describe-flat"() {
		const v = [];
		const unknown = [];
		let tests = 0;
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			tests += testCalls(s.sf).length;
			for (const d of describeCalls(s.sf)) {
				const outer = enclosingDescribe(d.call);
				if (ts.isSourceFile(outer)) {
					continue;
				}
				const outerName = describeName(outer);
				// 外側が操作の単位（Task.create / TaskRepositoryImpl.get のように「.」を含む名前）なら、
				// 内側は観点か条件で分けた入れ子である
				if (outerName?.includes(".")) {
					v.push(
						`${at(s, d.call)} describe(${JSON.stringify(outerName)}) の中に describe がある`,
					);
				} else {
					unknown.push(
						`${at(s, d.call)} 外側の describe(${outerName === undefined ? "名前が文字列でない" : JSON.stringify(outerName)}) が操作の単位かを決められない`,
					);
				}
			}
		}
		return result(
			"test-describe-flat",
			v,
			tests === 0 ? "適用外: テストが無い" : "入れ子の describe は0件",
			unknown,
		);
	},

	// ---------- 確実な違反だけを返すもの（passed は false か null。採点役への証拠） ----------

	"error-message-form"() {
		const v = [];
		const seen = [];
		const check = (s, node, text) => {
			seen.push(at(s, node));
			const body = text.trim().replace(/。$/, "");
			if (!/(です|できません)$/.test(body)) {
				v.push(`${at(s, node)} ${JSON.stringify(text)}`);
			}
		};
		for (const s of implSources()) {
			visit(s.sf, (n) => {
				// Zod のメソッドに渡した { error: "…" } / { message: "…" } と、ctx.addIssue({ message: "…" })
				if (ts.isCallExpression(n) && isZodCall(n)) {
					for (const [i, a] of n.arguments.entries()) {
						if (i === 0 && ZOD_SHAPE_FIRST.has(calledName(n))) {
							continue;
						}
						const arg = unwrap(a);
						if (ts.isObjectLiteralExpression(arg)) {
							for (const p of arg.properties) {
								if (
									ts.isPropertyAssignment(p) &&
									ts.isIdentifier(p.name) &&
									(p.name.text === "error" || p.name.text === "message")
								) {
									const text = literalText(p.initializer);
									if (text !== undefined) {
										check(s, p.initializer, text);
									}
								}
							}
						}
					}
					const index = ZOD_MESSAGE_ARG[calledName(n)];
					const arg = index === undefined ? undefined : n.arguments[index];
					const text = arg && literalText(arg);
					if (text !== undefined) {
						check(s, arg, text);
					}
				}
				// 業務のエラーの class が基底に渡す、class の中で決めた文
				if (ts.isClassDeclaration(n) && n.name) {
					if (n.name.text === "FatalUnreachableError" || isAbstractClass(n)) {
						return;
					}
					const parent = extendsTarget(n);
					if (parent.builtin || !parent.decl) {
						return;
					}
					const parentSource = messageSource(parent.decl);
					if (parentSource.kind !== "param") {
						return;
					}
					const ctor = n.members.find(
						(m) => ts.isConstructorDeclaration(m) && m.body,
					);
					let superCall;
					if (ctor) {
						visit(ctor.body, (m) => {
							if (
								!superCall &&
								ts.isCallExpression(m) &&
								m.expression.kind === ts.SyntaxKind.SuperKeyword
							) {
								superCall = m;
							}
						});
					}
					const arg = superCall?.arguments[parentSource.index];
					const text = arg && literalText(arg);
					if (text !== undefined) {
						check(s, arg, text);
					}
				}
			});
		}
		return evidenceOnly(
			"error-message-form",
			v,
			`構文で拾えたメッセージ ${seen.length}件は「です」「できません」で終わる。拾えない書き方（定数・関数・Result の値など）があるので、採点役が判定する`,
		);
	},

	"test-name-prefix"() {
		const PREFIXES = ["正常系: ", "異常系: ", "不変性: ", "型: "];
		const v = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			for (const t of testCalls(s.sf)) {
				if (t.name === undefined) {
					continue;
				}
				const prefix = PREFIXES.find((p) => t.name.startsWith(p));
				const where = `${at(s, t.call)} ${JSON.stringify(t.name)}`;
				if (!prefix) {
					v.push(`${where} が4つの接頭辞のどれでも始まらない`);
				} else if (isTypeTest(s.rel) && prefix !== "型: ") {
					v.push(`${where} は型のテストなのに 型: で始まらない`);
				} else if (!isTypeTest(s.rel) && prefix === "型: ") {
					v.push(`${where} は型のテストのファイルに無いのに 型: で始まる`);
				}
			}
		}
		return evidenceOnly(
			"test-name-prefix",
			v,
			"接頭辞の欠落と、型のテストのファイルとの食い違いは0件。振り分け（例外で終わるか）は採点役が判定する",
		);
	},

	"test-name-predicate"() {
		const v = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			for (const t of testCalls(s.sf)) {
				const name = t.name?.trim();
				if (name === undefined) {
					continue;
				}
				if (/(^|[\s:（(])(true|false)$/.test(name)) {
					v.push(
						`${at(s, t.call)} ${JSON.stringify(name)} が true / false で終わる`,
					);
				} else if (/(^|[\s:（(])[A-Z][A-Za-z0-9]*Error$/.test(name)) {
					v.push(
						`${at(s, t.call)} ${JSON.stringify(name)} が class 名で終わる`,
					);
				}
			}
		}
		return evidenceOnly(
			"test-name-predicate",
			v,
			"class 名・true / false で終わるテスト名は0件。名詞で終えていないか、「〜なら」の書き方は採点役が判定する",
		);
	},

	"gwt-sentence"() {
		const HEAD = /^\/\/\s*(Given|When|Then|And):(.*)$/;
		const v = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			const comments = lineComments(s.sf).filter((c) => !c.block);
			for (const t of testCalls(s.sf)) {
				if (!t.body) {
					continue;
				}
				const from = lineOf(s.sf, t.body.getStart(s.sf));
				const to = lineOf(s.sf, t.body.getEnd());
				const inside = comments.filter((c) => c.line >= from && c.line <= to);
				const heads = inside
					.map((c) => ({ c, m: c.text.trim().match(HEAD) }))
					.filter((h) => h.m);
				const order = heads.filter((h) => h.m[1] !== "And").map((h) => h.m[1]);
				if (order.join(",") !== "Given,When,Then") {
					continue;
				}
				for (const h of heads) {
					const kind = h.m[1];
					const text = h.m[2].trim();
					const where = `${s.rel}:${h.c.line}`;
					// 見出しの次の行にもコメントがあると、説明の続きか補足かを構文では分けられないので数えない
					const continued = inside.some(
						(c) => c.line === h.c.line + 1 && !HEAD.test(c.text.trim()),
					);
					if (kind === "Given" && !/(とき|で)$/.test(text) && !continued) {
						v.push(`${where} Given が「とき」「で」で終わらない: ${text}`);
					} else if (kind === "When" && !/と$/.test(text) && !continued) {
						v.push(`${where} When が「と」で終わらない: ${text}`);
					} else if (
						(kind === "Then" || kind === "And") &&
						/で失敗する/.test(text)
					) {
						v.push(`${where} 「で失敗する」と書いている: ${text}`);
					}
				}
			}
		}
		return evidenceOnly(
			"gwt-sentence",
			v,
			"Given・When の語尾と「で失敗する」の違反は0件。Then の結果の状態と、名詞止めは採点役が判定する",
		);
	},

	"local-name"() {
		return evidenceOnly(
			"local-name",
			bareLocalNames(
				(rel) => !/DTO/.test(path.basename(rel)),
				["create", "reconstruct", "equals"],
			),
			"公開 API のキーと同じ名前のローカル関数と、create / reconstruct / equals という名前の関数は0件。名前が完全名かどうかは採点役が判定する",
		);
	},

	"dto-local-name"() {
		return evidenceOnly(
			"dto-local-name",
			bareLocalNames((rel) => /DTO/.test(path.basename(rel)), ["to", "from"]),
			"DTO の公開 API のキーと同じ名前のローカル関数と、to / from という名前の関数は0件。名前に DTO 名が入っているかは採点役が判定する",
		);
	},

	"jsdoc-class-word"() {
		const v = [];
		for (const s of implSources()) {
			for (const c of lineComments(s.sf)) {
				if (!c.block || !c.text.startsWith("/**")) {
					continue;
				}
				for (const m of c.text.matchAll(
					/(基底|抽象|具象|エラー|親|子)クラス|基底。/g,
				)) {
					v.push(`${s.rel}:${c.line} ${m[0]}`);
				}
			}
		}
		return evidenceOnly(
			"jsdoc-class-word",
			v,
			"「基底クラス」「基底。」のような書き方は0件。ほかの書き方で class を指していないかは採点役が判定する",
		);
	},
	// ---------- インフラの実装の生成関数と依存の型 ----------

	"impl-factory-name"() {
		const files = implFiles();
		if (files.length === 0) {
			return {
				tag: "impl-factory-name",
				passed: null,
				evidence:
					"インフラの実装のファイル（XxxImpl.ts・*-impl/ の下）が見つからない（採点役が判定する）",
			};
		}
		const v = [];
		const unknown = [];
		for (const s of files) {
			const fns = topLevelFunctions(s.sf);
			if (fns.some((f) => IMPL_FACTORY.test(f.name))) {
				continue;
			}
			const misnamed = fns.filter(
				(f) => f.exported && /^create[A-Z]/.test(f.name),
			);
			if (misnamed.length > 0) {
				for (const f of misnamed) {
					v.push(`${at(s, f.node)} ${f.name} が createXxxImpl の形でない`);
				}
			} else {
				unknown.push(`${s.rel} に生成関数を見つけられない`);
			}
		}
		return result(
			"impl-factory-name",
			v,
			`実装のファイル ${files.length}件すべての生成関数が createXxxImpl の形`,
			unknown,
		);
	},

	"impl-factory-export"() {
		const files = implFiles();
		const v = [];
		const unknown = [];
		let factories = 0;
		for (const s of files) {
			const fns = topLevelFunctions(s.sf);
			const named = fns.filter((f) => IMPL_FACTORY.test(f.name));
			const targets =
				named.length > 0
					? named
					: fns.filter((f) => /^create[A-Z]/.test(f.name));
			if (targets.length === 0) {
				continue;
			}
			for (const f of targets) {
				factories++;
				if (f.defaultExport) {
					v.push(`${at(s, f.node)} ${f.name} を default で export している`);
				} else if (!f.exported) {
					if (named.length > 0) {
						v.push(`${at(s, f.node)} ${f.name} を export していない`);
					} else {
						unknown.push(`${s.rel} の ${f.name} が生成関数かを決められない`);
					}
				}
			}
		}
		return result(
			"impl-factory-export",
			v,
			factories === 0
				? "適用外: 生成関数が無い（欠落は [impl-factory-name] で数える）"
				: `生成関数 ${factories}件すべてを名前付きで export している`,
			unknown,
		);
	},

	"impl-deps-name"() {
		const files = implFiles();
		if (files.length === 0) {
			return {
				tag: "impl-deps-name",
				passed: null,
				evidence: "インフラの実装のファイルが見つからない（採点役が判定する）",
			};
		}
		const v = [];
		const unknown = [];
		let checked = 0;
		for (const s of files) {
			const factories = topLevelFunctions(s.sf).filter((f) =>
				IMPL_FACTORY.test(f.name),
			);
			if (factories.length === 0) {
				unknown.push(
					`${s.rel} に createXxxImpl の生成関数が無いので依存の型を特定できない`,
				);
				continue;
			}
			for (const f of factories) {
				const param = f.params[0];
				if (!param) {
					continue;
				}
				checked++;
				const type = param.type;
				if (!type) {
					unknown.push(`${at(s, f.node)} ${f.name} の引数に型の注釈が無い`);
				} else if (
					ts.isTypeReferenceNode(type) &&
					ts.isIdentifier(type.typeName)
				) {
					if (!/^[A-Z]\w*ImplDeps$/.test(type.typeName.text)) {
						v.push(
							`${at(s, f.node)} ${f.name} の依存の型 ${type.typeName.text} が XxxImplDeps の形でない`,
						);
					}
				} else if (ts.isTypeLiteralNode(type)) {
					v.push(
						`${at(s, f.node)} ${f.name} の依存の型に名前が無い（その場で書いた型）`,
					);
				} else {
					unknown.push(`${at(s, f.node)} ${f.name} の依存の型を読めない`);
				}
			}
		}
		return result(
			"impl-deps-name",
			v,
			checked === 0
				? "適用外: 依存を受け取る生成関数が無い"
				: `生成関数 ${checked}件すべての依存の型が XxxImplDeps の形`,
			unknown,
		);
	},

	// ---------- 確実な違反だけを返すもの ----------

	"dto-plain-export"() {
		const v = [];
		for (const s of implSources().filter((x) =>
			/DTO/.test(path.basename(x.rel)),
		)) {
			const localFunctions = new Set(
				topLevelFunctions(s.sf).map((f) => f.name),
			);
			// 値が関数か、同じファイルの関数を名前で指すプロパティ
			const isFunctionValue = (node) => {
				const n = stripAssertions(node);
				return (
					isFunctionLike(n) ||
					(ts.isIdentifier(n) && localFunctions.has(n.text))
				);
			};
			for (const st of s.sf.statements) {
				if (!ts.isVariableStatement(st) || !isExported(st)) {
					continue;
				}
				for (const d of st.declarationList.declarations) {
					const init = d.initializer && stripAssertions(d.initializer);
					if (
						init &&
						ts.isObjectLiteralExpression(init) &&
						init.properties.some(
							(p) =>
								(ts.isShorthandPropertyAssignment(p) &&
									localFunctions.has(p.name.text)) ||
								ts.isMethodDeclaration(p) ||
								(ts.isPropertyAssignment(p) && isFunctionValue(p.initializer)),
						)
					) {
						v.push(
							`${at(s, d)} ${d.name.getText(s.sf)} に関数を集めたオブジェクトを export している`,
						);
					}
				}
			}
		}
		return evidenceOnly(
			"dto-plain-export",
			v,
			"DTO のファイルに、関数を集めたオブジェクトの export は0件。変換と保存キーの生成を名前付きで export しているかは採点役が判定する",
		);
	},

	"section-placement"() {
		const v = [];
		for (const s of implSources()) {
			const sections = sectionHeaders(s.sf);
			for (let i = 0; i < sections.length; i++) {
				if (sections[i].name !== "スキーマ・型定義") {
					continue;
				}
				const from = sections[i].line;
				const to = sections[i + 1]?.line ?? Number.POSITIVE_INFINITY;
				for (const st of s.sf.statements) {
					const line = lineOf(s.sf, st.getStart(s.sf));
					if (line <= from || line >= to) {
						continue;
					}
					const isFunction =
						ts.isFunctionDeclaration(st) ||
						(ts.isVariableStatement(st) &&
							st.declarationList.declarations.some(
								(d) =>
									d.initializer &&
									isFunctionLike(stripAssertions(d.initializer)),
							));
					if (isFunction) {
						v.push(`${at(s, st)} 「スキーマ・型定義」のセクションに関数がある`);
					}
				}
			}
		}
		return evidenceOnly(
			"section-placement",
			v,
			"「スキーマ・型定義」のセクションの関数は0件。役割ごとのセクションに置いているか、既存の流儀に合わせた出力かは採点役が判定する",
		);
	},

	"throw-concrete"() {
		const v = [];
		for (const s of testSources().filter((x) => !isTypeTest(x.rel))) {
			visit(s.sf, (n) => {
				// toBeInstanceOf は継承を確かめるテスト（エラー class のテスト）でも基底を渡すので見ない
				const m = matcherCall(n, ["toThrow", "toThrowError"]);
				if (!m) {
					return;
				}
				const arg = m.call.arguments[0];
				if (m.negated) {
					if (arg) {
						v.push(`${at(s, n)} not.${m.name}(別の種別) で確かめている`);
					}
					return;
				}
				if (!arg) {
					v.push(`${at(s, n)} ${m.name}() に種別を渡していない`);
					return;
				}
				const broad = broadErrorType(unwrap(arg));
				if (broad) {
					v.push(`${at(s, n)} ${m.name}(${broad})`);
				}
			});
		}
		return evidenceOnly(
			"throw-concrete",
			v,
			"toThrow() と、toThrow に Error・ZodError・抽象の基底を渡す箇所、not.toThrow(別の種別) は0件。toBeInstanceOf で確かめているもの、具象の class が1つで基底を兼ねる場合などは採点役が判定する",
		);
	},

	"no-expect-in-catch"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (ts.isCatchClause(n) && containsExpect(n.block)) {
					v.push(`${at(s, n)} catch の中に expect がある`);
				}
			});
		}
		return evidenceOnly(
			"no-expect-in-catch",
			v,
			"catch の中の expect は0件。例外の中身を When で捕まえて Then で確かめているかは採点役が判定する",
		);
	},

	"gwt-adjacent"() {
		const v = [];
		for (const s of testSources().filter(
			(x) => !isHelper(x.rel) && !isTypeTest(x.rel),
		)) {
			const lines = s.sf.getFullText().split("\n");
			for (const t of testCalls(s.sf)) {
				const heads = gwtHeads(s, t);
				const when = heads.find((h) => h.kind === "When");
				const then = heads.find((h) => h.kind === "Then");
				if (!when || !then || then.line < when.line) {
					continue;
				}
				if (then.line === when.line + 1) {
					const firstExpect = firstExpectAfter(t.body, s.sf, then.line);
					if (firstExpect && !executesTarget(firstExpect)) {
						v.push(
							`${s.rel}:${then.line} When と Then が隣接しているのに、matcher が対象操作を実行していない`,
						);
					}
				} else if ((lines[then.line - 2] ?? "").trim() !== "") {
					v.push(`${s.rel}:${then.line} // Then: の前に空行が無い`);
				}
			}
		}
		return evidenceOnly(
			"gwt-adjacent",
			v,
			"隣接の誤りと、Then の前の空行の欠落は0件。セクションを分けるためだけに対象操作を包む関数を作っていないかは採点役が判定する",
		);
	},

	"gwt-invalid-word"() {
		const found = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			for (const t of testCalls(s.sf)) {
				for (const h of gwtHeads(s, t)) {
					if (/不正な/.test(h.text)) {
						found.push(`${s.rel}:${h.line} ${h.text}`);
					}
				}
			}
		}
		return evidenceList(
			"gwt-invalid-word",
			found,
			"「不正な」を含む説明",
			"「不正な」を含む説明は0件",
		);
	},

	"gwt-no-var-name"() {
		// result・expected・caught は業務の語（エラーの項目の expected など）にもなるので、候補として並べるだけにする
		const VAR = /(^|[^A-Za-z0-9_$])(result|expected|caught)(?![A-Za-z0-9_$])/;
		const PHRASE = /書き下ろした|DTO と同じ保存キー|ヘルパーで作った/;
		const v = [];
		const candidates = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			for (const t of testCalls(s.sf)) {
				const texts = [
					...(t.name !== undefined
						? [{ line: lineOf(s.sf, t.call.getStart(s.sf)), text: t.name }]
						: []),
					...gwtHeads(s, t),
				];
				for (const x of texts) {
					const phrase = x.text.match(PHRASE);
					if (phrase) {
						v.push(`${s.rel}:${x.line} ${phrase[0]}: ${x.text}`);
					} else if (VAR.test(x.text)) {
						candidates.push(`${s.rel}:${x.line} ${x.text}`);
					}
				}
			}
		}
		if (v.length > 0) {
			return result("gwt-no-var-name", v, "");
		}
		return evidenceList(
			"gwt-no-var-name",
			candidates,
			"「書き下ろした」などの言い回しは0件。result・expected・caught を含む説明（変数名か業務の語かは採点役が判定する）",
			"「書き下ろした」などの言い回しと、result・expected・caught を含む説明は0件",
		);
	},

	"expected-in-then"() {
		const v = [];
		for (const s of testSources().filter((x) => !isHelper(x.rel))) {
			for (const t of testCalls(s.sf)) {
				const when = gwtHeads(s, t).find((h) => h.kind === "When");
				if (!when || !t.body) {
					continue;
				}
				visit(t.body, (n) => {
					if (
						ts.isVariableDeclaration(n) &&
						ts.isIdentifier(n.name) &&
						/^(expected|want)([A-Z_]|$)/.test(n.name.text) &&
						lineOf(s.sf, n.getStart(s.sf)) < when.line
					) {
						v.push(`${at(s, n)} ${n.name.text} を When より前に組み立てている`);
					}
				});
			}
		}
		return evidenceOnly(
			"expected-in-then",
			v,
			"When より前の expected・want の宣言は0件。そのほかの期待値の組み立ての位置は採点役が判定する",
		);
	},

	"one-call"() {
		const found = [];
		for (const s of testSources().filter(
			(x) => !isHelper(x.rel) && !isTypeTest(x.rel),
		)) {
			for (const t of testCalls(s.sf)) {
				const owner = enclosingDescribe(t.call);
				const op = ts.isCallExpression(owner) ? describeName(owner) : undefined;
				if (
					!op ||
					!/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(op) ||
					!t.body
				) {
					continue;
				}
				let calls = 0;
				visit(t.body, (n) => {
					if (ts.isCallExpression(n) && n.expression.getText(s.sf) === op) {
						calls++;
					}
				});
				if (calls > 1) {
					found.push(`${at(s, t.call)} ${op} を${calls}回呼んでいる`);
				}
			}
		}
		return evidenceList(
			"one-call",
			found,
			"対象操作を2回以上呼んでいるテスト（往復や冪等性のテストなら満たす）",
			"describe の操作を2回以上呼ぶテストは0件",
		);
	},

	"helper-reconstruct"() {
		const v = [];
		for (const s of sources.filter((x) => isHelper(x.rel))) {
			visit(s.sf, (n) => {
				if (
					ts.isCallExpression(n) &&
					ts.isPropertyAccessExpression(n.expression) &&
					n.expression.name.text === "create" &&
					ts.isIdentifier(n.expression.expression) &&
					/^[A-Z]/.test(n.expression.expression.text)
				) {
					v.push(`${at(s, n)} ${n.expression.getText(s.sf)} で作っている`);
				}
			});
		}
		return evidenceOnly(
			"helper-reconstruct",
			v,
			"ヘルパーの中の Xxx.create の呼び出しは0件。業務操作で作っていないかは採点役が判定する",
		);
	},

	"test-name-error-class"() {
		const v = [];
		for (const s of testSources().filter(
			(x) => !isHelper(x.rel) && !isTypeTest(x.rel),
		)) {
			for (const t of testCalls(s.sf)) {
				if (t.name === undefined || !t.body) {
					continue;
				}
				// 候補にするのは、Error の系列と確定できる具象の class だけにする。送信したコマンドの
				// toBeInstanceOf(PutCommand) のような例外でない値の検査と、new で作ったエラーを直接確かめる
				// エラー class のテストは数えない。系列を決められない class が1つでもあれば、そのテストは決めない
				const classes = new Set();
				let undecided = false;
				visit(t.body, (n) => {
					const m = matcherCall(n, [
						"toThrow",
						"toThrowError",
						"toBeInstanceOf",
					]);
					const arg = m && !m.negated ? unwrap(m.call.arguments[0]) : undefined;
					if (!arg || broadErrorType(arg)) {
						return;
					}
					if (
						m.name === "toBeInstanceOf" &&
						constructedDirectly(expectSubject(m.call))
					) {
						return;
					}
					if (!ts.isIdentifier(arg)) {
						undecided = true;
						return;
					}
					const lineage = errorLineage(arg);
					if (lineage === undefined) {
						undecided = true;
					} else if (lineage) {
						classes.add(arg.text);
					}
				});
				if (
					!undecided &&
					classes.size > 0 &&
					![...classes].some((c) => t.name.includes(c))
				) {
					v.push(
						`${at(s, t.call)} ${JSON.stringify(t.name)} に ${[...classes].join("・")} が入っていない`,
					);
				}
			}
		}
		return evidenceOnly(
			"test-name-error-class",
			v,
			"確かめている具象のエラーの class 名がテスト名に無いテストは0件（Error の系列と確定できない class と、new で作った値の toBeInstanceOf は数えない）。例外を確かめるテストの見分けと、伝播のテストの除外は採点役が判定する",
		);
	},

	"table-name"() {
		const v = [];
		for (const s of testSources()) {
			visit(s.sf, (n) => {
				if (
					!ts.isCallExpression(n) ||
					!ts.isCallExpression(n.expression) ||
					!ts.isPropertyAccessExpression(n.expression.expression) ||
					n.expression.expression.name.text !== "for" ||
					rootIdentifier(n.expression.expression) !== "test"
				) {
					return;
				}
				const name = n.arguments[0];
				const text =
					name &&
					(ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
						? name.text
						: undefined;
				if (text !== undefined && !/[$%]/.test(text)) {
					v.push(`${at(s, n)} ${JSON.stringify(text)} に行の値の書式が無い`);
				}
			});
		}
		return evidenceOnly(
			"table-name",
			v,
			"行の値の書式（$name など）が無い test.for は0件。書式が行ごとの入力の違いを表しているかは採点役が判定する",
		);
	},
};

// -------------------------------------------------
// エラーの class の補助
// -------------------------------------------------

// 組み込みの Error・TypeError・RangeError などを指す識別子か（同じ名前の自作の class は数えない）
function isBuiltinErrorConstructor(identifier) {
	if (!/Error$/.test(identifier.text)) {
		return false;
	}
	const symbol = checker.getSymbolAtLocation(identifier);
	const decls = symbol?.getDeclarations() ?? [];
	if (decls.length === 0) {
		return false;
	}
	return decls.every((d) =>
		program.isSourceFileDefaultLibrary(d.getSourceFile()),
	);
}

function isAbstractClass(cls) {
	return (ts.getModifiers(cls) ?? []).some(
		(m) => m.kind === ts.SyntaxKind.AbstractKeyword,
	);
}

// extends の先。{ builtin, name } / { decl } / { none } / { unresolved, name }
function extendsTarget(cls) {
	const clause = cls.heritageClauses?.find(
		(c) => c.token === ts.SyntaxKind.ExtendsKeyword,
	);
	const expr = clause?.types[0]?.expression;
	if (!expr) {
		return { none: true };
	}
	const name = expr.getText();
	if (ts.isIdentifier(expr) && isBuiltinErrorConstructor(expr)) {
		return { builtin: true, name };
	}
	let symbol = checker.getSymbolAtLocation(expr);
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	const decl = (symbol?.getDeclarations() ?? []).find(ts.isClassDeclaration);
	return decl ? { decl } : { unresolved: true, name };
}

function effectiveConstructor(cls) {
	for (let c = cls, depth = 0; c && depth < 20; depth++) {
		const ctor = c.members.find(
			(m) => ts.isConstructorDeclaration(m) && m.body,
		);
		if (ctor) {
			return ctor;
		}
		c = extendsTarget(c).decl;
	}
	return undefined;
}

// その class のコンストラクタのどの引数が、組み込みの Error に渡る文になるか。
// { kind: "param", index } 呼び出し側が渡した引数がそのまま文になる
// { kind: "fixed" }         文は class の中で決まる（値を埋め込むだけの組み立てを含む）
// { kind: "none" }          Error の系列ではない
// { kind: "unknown", why }  構文だけでは決められない
const messageMemo = new Map();
function messageSource(cls, depth = 0) {
	if (messageMemo.has(cls)) {
		return messageMemo.get(cls);
	}
	const answer = computeMessageSource(cls, depth);
	messageMemo.set(cls, answer);
	return answer;
}

function computeMessageSource(cls, depth) {
	if (depth > 20) {
		return { kind: "unknown", why: "継承が深すぎる" };
	}
	const parent = extendsTarget(cls);
	if (parent.none) {
		return { kind: "none" };
	}
	if (parent.unresolved) {
		return /Error/.test(parent.name)
			? { kind: "unknown", why: `親の class ${parent.name} を解決できない` }
			: { kind: "none" };
	}
	const parentSource = parent.builtin
		? { kind: "param", index: 0 }
		: messageSource(parent.decl, depth + 1);
	if (parentSource.kind !== "param") {
		return parentSource;
	}
	const ctor = cls.members.find(
		(m) => ts.isConstructorDeclaration(m) && m.body,
	);
	if (!ctor) {
		return parentSource;
	}
	const params = ctor.parameters.map((p) =>
		ts.isIdentifier(p.name) ? p.name.text : undefined,
	);
	if (params.includes(undefined)) {
		return {
			kind: "unknown",
			why: "コンストラクタの引数が分割代入になっている",
		};
	}
	let superCall;
	visit(ctor.body, (n) => {
		if (
			!superCall &&
			ts.isCallExpression(n) &&
			n.expression.kind === ts.SyntaxKind.SuperKeyword
		) {
			superCall = n;
		}
	});
	if (!superCall) {
		return { kind: "unknown", why: "super の呼び出しが見つからない" };
	}
	if (superCall.arguments.some(ts.isSpreadElement)) {
		return { kind: "unknown", why: "super にスプレッドで渡している" };
	}
	const arg = superCall.arguments[parentSource.index];
	if (!arg) {
		return { kind: "fixed" };
	}
	const a = unwrap(arg);
	if (ts.isIdentifier(a) && params.includes(a.text)) {
		return { kind: "param", index: params.indexOf(a.text) };
	}
	let referencesParam = false;
	visit(a, (n) => {
		if (ts.isIdentifier(n) && params.includes(n.text)) {
			referencesParam = true;
		}
	});
	if (!referencesParam) {
		return { kind: "fixed" };
	}
	// 基底（組み込みの Error を直接継承する class）は operation と文を1つの文字列に組み立てて渡すので、
	// どの引数が文かは名前で決める。業務のエラーの側では、引数を埋め込んだテンプレートは class の中で組み立てた文である
	if (parent.builtin) {
		const index = params.indexOf("message");
		return index >= 0
			? { kind: "param", index }
			: {
					kind: "unknown",
					why: "基底のコンストラクタに message という名前の引数が無い",
				};
	}
	if (ts.isTemplateExpression(a)) {
		return { kind: "fixed" };
	}
	return { kind: "unknown", why: "文を引数を使った式で組み立てている" };
}

function isUniqueSymbolDeclared(sf, name) {
	return uniqueSymbolDeclarations(sf).some((d) => d.name === name);
}

function uniqueSymbolDeclarations(sf) {
	const found = [];
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) {
			continue;
		}
		const exported = (stmt.modifiers ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		);
		for (const d of stmt.declarationList.declarations) {
			if (
				d.type &&
				ts.isTypeOperatorNode(d.type) &&
				d.type.operator === ts.SyntaxKind.UniqueKeyword &&
				ts.isIdentifier(d.name)
			) {
				found.push({
					name: d.name.text,
					exported,
					line: lineOf(sf, d.getStart(sf)),
				});
			}
		}
	}
	return found;
}

function enclosingDescribe(node) {
	for (let p = node.parent; p; p = p.parent) {
		if (ts.isCallExpression(p) && rootIdentifier(p.expression) === "describe") {
			return p;
		}
	}
	return node.getSourceFile();
}

function containsExpectOutsideTests(node) {
	let hit = false;
	visit(node, (n) => {
		if (ts.isCallExpression(n) && isExpectCall(n)) {
			let inTest = false;
			for (let p = n.parent; p && p !== node; p = p.parent) {
				if (
					ts.isCallExpression(p) &&
					["test", "it"].includes(rootIdentifier(p.expression) ?? "")
				) {
					inTest = true;
				}
			}
			if (!inTest) {
				hit = true;
			}
		}
	});
	return hit;
}

// vi.fn(...) / vi.spyOn(...) と、それに続く mockResolvedValue などの連なり
function createsMock(call) {
	let n = call;
	while (
		ts.isCallExpression(n) &&
		ts.isPropertyAccessExpression(n.expression)
	) {
		const target = n.expression.expression;
		if (
			ts.isIdentifier(target) &&
			target.text === "vi" &&
			["fn", "spyOn"].includes(n.expression.name.text)
		) {
			return true;
		}
		n = target;
	}
	return false;
}

// -------------------------------------------------
// vitest の設定を読む補助
// -------------------------------------------------

function propertyNameText(name) {
	return ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNoSubstitutionTemplateLiteral(name)
		? name.text
		: undefined;
}

// 設定ファイルを構文木で読み、名前が一致するプロパティを集める。コメントは構文木に入らないので読まない。
// スプレッドや mergeConfig で組み立てていれば dynamic を立てる（値を決めきれない）
function configProperties(rel, name) {
	const text = fs.readFileSync(path.join(outputsDir, rel), "utf8");
	const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
	const found = [];
	let dynamic = false;
	visit(sf, (n) => {
		if (ts.isPropertyAssignment(n) && propertyNameText(n.name) === name) {
			found.push(n);
		}
		if (
			ts.isSpreadAssignment(n) ||
			(ts.isCallExpression(n) && calledName(n) === "mergeConfig")
		) {
			dynamic = true;
		}
	});
	return { found, dynamic };
}

// プロパティが入っているオブジェクトリテラルを値に持つプロパティの名前（test.exclude なら "test"）。
// オブジェクトが変数に置かれているなど、名前を決められなければ undefined
function ownerPropertyName(prop) {
	const obj = prop.parent;
	if (!obj || !ts.isObjectLiteralExpression(obj)) {
		return undefined;
	}
	let p = obj.parent;
	while (
		p &&
		(ts.isParenthesizedExpression(p) ||
			ts.isAsExpression(p) ||
			ts.isSatisfiesExpression(p))
	) {
		p = p.parent;
	}
	return p && ts.isPropertyAssignment(p) ? propertyNameText(p.name) : undefined;
}

// 文字列の配列を読む。文字列以外が混ざれば undefined
function stringArray(node) {
	const init = unwrap(node);
	if (!ts.isArrayLiteralExpression(init)) {
		return undefined;
	}
	const out = [];
	for (const el of init.elements) {
		if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
			out.push(el.text);
		} else {
			return undefined;
		}
	}
	return out;
}

// exclude: [...configDefaults.exclude, ...] の既定の除外
function isConfigDefaultsSpread(el) {
	return (
		ts.isSpreadElement(el) &&
		ts.isPropertyAccessExpression(el.expression) &&
		ts.isIdentifier(el.expression.expression) &&
		el.expression.expression.text === "configDefaults"
	);
}

// -------------------------------------------------
// 証拠だけを返す判定の補助
// -------------------------------------------------

// 規則の一部しか構文で決まらない項目は、確実な違反だけを false で返し、見つからなければ null にする。
// null の項目は採点役が判定する（README「スクリプトで判定する採点項目」）
function evidenceOnly(tag, violations, note) {
	if (violations.length > 0) {
		return result(tag, violations, note);
	}
	return {
		tag,
		passed: null,
		evidence: `確実な違反は見つからなかった（この項目は採点役が判定する）。${note}`,
	};
}

// 候補を列挙するだけで、合否は決めないもの。null を返し、見つけた箇所を採点役への手がかりとして出す
function evidenceList(tag, items, label, none) {
	if (items.length === 0) {
		return {
			tag,
			passed: null,
			evidence: `${none}（この項目は採点役が判定する）`,
		};
	}
	const shown = items.slice(0, MAX_EVIDENCE).join("; ");
	const more =
		items.length > MAX_EVIDENCE ? ` ほか${items.length - MAX_EVIDENCE}件` : "";
	return {
		tag,
		passed: null,
		evidence: `${label} ${items.length}件（採点役が判定する）: ${shown}${more}`,
	};
}

// -------------------------------------------------
// 新しい判定の補助
// -------------------------------------------------

const IMPL_FACTORY = /^create[A-Z]\w*Impl$/;

// インフラの実装のファイル（XxxImpl.ts、または repository-impl/ のような *-impl/ の下）
function implFiles() {
	return implSources().filter(
		(s) =>
			/Impl\.(c|m)?tsx?$/.test(path.basename(s.rel)) ||
			s.rel.split(path.sep).some((part) => /-impl$/.test(part)),
	);
}

function hasModifier(node, kind) {
	return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
		(m) => m.kind === kind,
	);
}

const isExported = (st) => hasModifier(st, ts.SyntaxKind.ExportKeyword);

// 括弧・as・satisfies・<T> を外した式
function stripAssertions(node) {
	let n = node;
	while (
		n &&
		(ts.isParenthesizedExpression(n) ||
			ts.isAsExpression(n) ||
			ts.isSatisfiesExpression(n) ||
			ts.isTypeAssertionExpression(n))
	) {
		n = n.expression;
	}
	return n;
}

// ファイル直下の関数（function 宣言と、関数を代入した const）。export の有無も持つ
function topLevelFunctions(sf) {
	const exportedNames = new Set();
	const defaultNames = new Set();
	for (const st of sf.statements) {
		if (
			ts.isExportDeclaration(st) &&
			!st.moduleSpecifier &&
			st.exportClause &&
			ts.isNamedExports(st.exportClause)
		) {
			for (const el of st.exportClause.elements) {
				(el.name.text === "default" ? defaultNames : exportedNames).add(
					(el.propertyName ?? el.name).text,
				);
			}
		}
		if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
			defaultNames.add(st.expression.text);
		}
	}
	const found = [];
	for (const st of sf.statements) {
		if (ts.isFunctionDeclaration(st) && st.name) {
			const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
			found.push({
				name: st.name.text,
				node: st,
				params: [...st.parameters],
				exported:
					(isExported(st) && !isDefault) || exportedNames.has(st.name.text),
				defaultExport: isDefault || defaultNames.has(st.name.text),
			});
		} else if (ts.isVariableStatement(st)) {
			for (const d of st.declarationList.declarations) {
				const init = d.initializer && stripAssertions(d.initializer);
				if (ts.isIdentifier(d.name) && init && isFunctionLike(init)) {
					found.push({
						name: d.name.text,
						node: d,
						params: [...init.parameters],
						exported: isExported(st) || exportedNames.has(d.name.text),
						defaultExport: defaultNames.has(d.name.text),
					});
				}
			}
		}
	}
	return found;
}

// セクションの区切り（// ---- の行に挟まれた1行の見出し）を上から並べる
function sectionHeaders(sf) {
	const comments = lineComments(sf).filter((c) => !c.block && !c.trailing);
	const isRule = (c) => /^\/\/\s*-{3,}\s*$/.test(c.text.trim());
	const found = [];
	for (let i = 1; i + 1 < comments.length; i++) {
		const c = comments[i];
		if (
			!isRule(c) &&
			isRule(comments[i - 1]) &&
			comments[i - 1].line === c.line - 1 &&
			isRule(comments[i + 1]) &&
			comments[i + 1].line === c.line + 1
		) {
			found.push({ name: c.text.trim().replace(/^\/\/\s*/, ""), line: c.line });
		}
	}
	return found;
}

// expect(...).<name>(...) / expect(...).not.<name>(...) / expect(...).rejects.<name>(...)
function matcherCall(node, names) {
	if (
		!ts.isCallExpression(node) ||
		!ts.isPropertyAccessExpression(node.expression) ||
		!names.includes(node.expression.name.text) ||
		rootIdentifier(node.expression) !== "expect"
	) {
		return undefined;
	}
	const target = node.expression.expression;
	return {
		call: node,
		name: node.expression.name.text,
		negated:
			ts.isPropertyAccessExpression(target) && target.name.text === "not",
	};
}

// 種別として広すぎる型の名前（Error・ZodError・抽象の class）。それ以外は undefined
function broadErrorType(arg) {
	const id = ts.isPropertyAccessExpression(arg) ? arg.name : arg;
	if (!ts.isIdentifier(id)) {
		return undefined;
	}
	if (id.text === "Error" || id.text === "ZodError") {
		return id.text;
	}
	let symbol = checker.getSymbolAtLocation(id);
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	const decls = symbol?.getDeclarations() ?? [];
	return decls.some((d) => ts.isClassDeclaration(d) && isAbstractClass(d))
		? id.text
		: undefined;
}

// matcher に渡した class が組み込みの Error の系列か。true / false / undefined（型から決められない）。
// 継承は型でたどる（AWS SDK のコマンドのように、変数の基底から継承する class も読める）
function errorLineage(id) {
	if (isBuiltinErrorConstructor(id)) {
		return true;
	}
	let symbol = checker.getSymbolAtLocation(id);
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	if (!symbol || !(symbol.flags & ts.SymbolFlags.Class)) {
		return undefined;
	}
	return typeInErrorLineage(checker.getDeclaredTypeOfSymbol(symbol), new Set());
}

function typeInErrorLineage(type, seen) {
	const target =
		type.flags & ts.TypeFlags.Object &&
		type.objectFlags & ts.ObjectFlags.Reference
			? type.target
			: type;
	if (seen.has(target)) {
		return false;
	}
	seen.add(target);
	const symbol = target.getSymbol();
	if (
		symbol?.name === "Error" &&
		(symbol.getDeclarations() ?? []).some((d) =>
			program.isSourceFileDefaultLibrary(d.getSourceFile()),
		)
	) {
		return true;
	}
	if (
		!(target.flags & ts.TypeFlags.Object) ||
		!(target.objectFlags & ts.ObjectFlags.ClassOrInterface)
	) {
		return undefined;
	}
	let undecided = false;
	for (const base of checker.getBaseTypes(target)) {
		const r = typeInErrorLineage(base, seen);
		if (r) {
			return true;
		}
		if (r === undefined) {
			undecided = true;
		}
	}
	return undecided ? undefined : false;
}

// expect(x).matcher(...) の x
function expectSubject(matcher) {
	let e = matcher.expression;
	while (ts.isPropertyAccessExpression(e)) {
		e = e.expression;
	}
	return ts.isCallExpression(e) && isExpectCall(e) ? e.arguments[0] : undefined;
}

// new で作った値か（new の式そのもの、または new の式で初期化した変数）。エラー class のテストが
// 作った値を直接確かめる形で、投げられた例外の検査ではない
function constructedDirectly(subject) {
	const s = subject && stripAssertions(subject);
	if (!s) {
		return false;
	}
	if (ts.isNewExpression(s)) {
		return true;
	}
	if (!ts.isIdentifier(s)) {
		return false;
	}
	const decl = checker.getSymbolAtLocation(s)?.getDeclarations()?.[0];
	return Boolean(
		decl &&
			ts.isVariableDeclaration(decl) &&
			decl.initializer &&
			ts.isNewExpression(stripAssertions(decl.initializer)),
	);
}

// テストの本体にある // Given: などの見出しと説明
function gwtHeads(s, t) {
	if (!t.body) {
		return [];
	}
	const HEAD = /^\/\/\s*(Given|When|Then|And):(.*)$/;
	const from = lineOf(s.sf, t.body.getStart(s.sf));
	const to = lineOf(s.sf, t.body.getEnd());
	return lineComments(s.sf)
		.filter((c) => !c.block && c.line >= from && c.line <= to)
		.map((c) => ({ line: c.line, m: c.text.trim().match(HEAD) }))
		.filter((h) => h.m)
		.map((h) => ({ kind: h.m[1], text: h.m[2].trim(), line: h.line }));
}

// line 行目以降で最初の expect(...) の呼び出し
function firstExpectAfter(body, sf, line) {
	let first;
	visit(body, (n) => {
		if (
			!first &&
			ts.isCallExpression(n) &&
			isExpectCall(n) &&
			lineOf(sf, n.getStart(sf)) >= line
		) {
			first = n;
		}
	});
	return first;
}

// matcher が対象操作を実行する形か（関数を渡す、rejects / resolves で Promise を渡す）。
// 変数を渡していて、その変数が関数でない値で宣言されていれば実行しない形とみなす。決められなければ true
function executesTarget(expectCall) {
	const parent = expectCall.parent;
	if (
		ts.isPropertyAccessExpression(parent) &&
		(parent.name.text === "rejects" || parent.name.text === "resolves")
	) {
		return true;
	}
	const arg = expectCall.arguments[0] && unwrap(expectCall.arguments[0]);
	if (!arg || isFunctionLike(arg)) {
		return true;
	}
	if (ts.isIdentifier(arg)) {
		const symbol = checker.getSymbolAtLocation(arg);
		const decl = symbol?.getDeclarations()?.[0];
		if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
			return isFunctionLike(stripAssertions(decl.initializer));
		}
		return true;
	}
	return !(
		ts.isCallExpression(arg) ||
		ts.isPropertyAccessExpression(arg) ||
		ts.isLiteralExpression(arg) ||
		ts.isObjectLiteralExpression(arg) ||
		ts.isArrayLiteralExpression(arg)
	);
}

// catch (e) { x = e; } の x
function catchTarget(catchClause) {
	const decl = catchClause.variableDeclaration;
	if (!decl || !ts.isIdentifier(decl.name)) {
		return undefined;
	}
	const caught = decl.name.text;
	for (const st of catchClause.block.statements) {
		if (!ts.isExpressionStatement(st)) {
			continue;
		}
		const e = unwrap(st.expression);
		if (
			ts.isBinaryExpression(e) &&
			e.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(e.left) &&
			ts.isIdentifier(unwrap(e.right)) &&
			unwrap(e.right).text === caught
		) {
			return e.left.text;
		}
	}
	return undefined;
}

function describeName(call) {
	const arg = call.arguments[0];
	return arg &&
		(ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
		? arg.text
		: undefined;
}

// 文字列リテラルの中身。テンプレートは最後の固定部分（語尾を見るため）。それ以外は undefined
function literalText(node) {
	const n = unwrap(node);
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
		return n.text;
	}
	if (ts.isTemplateExpression(n)) {
		const tail = n.templateSpans.at(-1)?.literal.text ?? "";
		return tail.trim() === "" ? undefined : tail;
	}
	return undefined;
}

// メッセージを位置で受け取る Zod のメソッドと、その引数の位置
const ZOD_MESSAGE_ARG = {
	min: 1,
	max: 1,
	length: 1,
	gt: 1,
	gte: 1,
	lt: 1,
	lte: 1,
	multipleOf: 1,
	regex: 1,
	refine: 1,
	startsWith: 1,
	endsWith: 1,
	includes: 1,
	nonnegative: 0,
	positive: 0,
	negative: 0,
	nonpositive: 0,
	int: 0,
	string: 0,
	number: 0,
	email: 0,
	url: 0,
	uuid: 0,
};
// 引数にデータや形を受け取るメソッド。{ error } / { message } を探す対象から外す
const ZOD_DATA_METHODS = new Set([
	"parse",
	"safeParse",
	"parseAsync",
	"safeParseAsync",
	"spa",
	"encode",
	"decode",
	"safeEncode",
	"safeDecode",
	"default",
	"prefault",
	"catch",
	"literal",
]);
const ZOD_SHAPE_FIRST = new Set([
	"object",
	"strictObject",
	"looseObject",
	"extend",
	"safeExtend",
	"pick",
	"omit",
	"partial",
	"required",
	"merge",
	"enum",
]);

// Zod の値（z 自身を含む）に対するメソッドの呼び出しで、メッセージを受け取りうるもの
function isZodCall(call) {
	const callee = call.expression;
	if (!ts.isPropertyAccessExpression(callee)) {
		return false;
	}
	const name = callee.name.text;
	if (ZOD_DATA_METHODS.has(name)) {
		return false;
	}
	return isZodType(callee.expression) === true;
}

// 公開 API のオブジェクトで、キーと同じ名前のローカル関数を集めている箇所（{ create } / { create: create }）と、
// 操作の名前だけの関数（function create / function to）
function bareLocalNames(fileFilter, bareNames) {
	const v = [];
	for (const s of implSources().filter((x) => fileFilter(x.rel))) {
		// ファイル直下の関数だけを見る（関数の中の補助の関数は数えない）
		for (const st of s.sf.statements) {
			const decls = ts.isFunctionDeclaration(st)
				? [st]
				: ts.isVariableStatement(st)
					? st.declarationList.declarations.filter(
							(d) =>
								d.initializer &&
								(ts.isArrowFunction(unwrap(d.initializer)) ||
									ts.isFunctionExpression(unwrap(d.initializer))),
						)
					: [];
			for (const n of decls) {
				const name =
					n.name && ts.isIdentifier(n.name) ? n.name.text : undefined;
				if (name && bareNames.includes(name)) {
					v.push(`${at(s, n)} 関数の名前が ${name} だけになっている`);
				}
			}
		}
		for (const st of s.sf.statements) {
			if (
				!ts.isVariableStatement(st) ||
				!(ts.getModifiers(st) ?? []).some(
					(m) => m.kind === ts.SyntaxKind.ExportKeyword,
				)
			) {
				continue;
			}
			for (const d of st.declarationList.declarations) {
				let init = d.initializer && unwrap(d.initializer);
				while (
					init &&
					(ts.isAsExpression(init) ||
						ts.isSatisfiesExpression(init) ||
						(ts.isCallExpression(init) &&
							init.expression.getText(s.sf) === "Object.freeze"))
				) {
					init = unwrap(
						ts.isCallExpression(init) ? init.arguments[0] : init.expression,
					);
				}
				if (!init || !ts.isObjectLiteralExpression(init)) {
					continue;
				}
				for (const p of init.properties) {
					let key;
					let symbol;
					if (ts.isShorthandPropertyAssignment(p)) {
						key = p.name.text;
						symbol = checker.getShorthandAssignmentValueSymbol(p);
					} else if (
						ts.isPropertyAssignment(p) &&
						ts.isIdentifier(p.name) &&
						ts.isIdentifier(unwrap(p.initializer)) &&
						unwrap(p.initializer).text === p.name.text
					) {
						key = p.name.text;
						symbol = checker.getSymbolAtLocation(unwrap(p.initializer));
					}
					if (!key || !symbol) {
						continue;
					}
					const isFunction = (symbol.getDeclarations() ?? []).some(
						(decl) =>
							ts.isFunctionDeclaration(decl) ||
							(ts.isVariableDeclaration(decl) &&
								decl.initializer &&
								(ts.isArrowFunction(unwrap(decl.initializer)) ||
									ts.isFunctionExpression(unwrap(decl.initializer)))),
					);
					if (isFunction) {
						v.push(`${at(s, p)} キー ${key} とローカル関数の名前が同じ`);
					}
				}
			}
		}
	}
	return v;
}

// -------------------------------------------------
// 実行
// -------------------------------------------------

// 規則の1行の要約と、規則の本文がある見出し。null の項目や違反を直すときは、この見出しの規則を読む。
// 見出しは build.py --check が実在を確かめる
const RULES = {
	"no-cast": [
		"型アサーション（as と <T>。as const を除く）で型を付けない",
		"SKILL.md#中核の規則",
	],
	"no-nested-ternary": [
		"三項演算子をネストしない",
		"references/model-code.md#分岐の書き方",
	],
	"comment-period": [
		"// のコメントは最後の行だけ句点なしで終える",
		"references/comments.md#理由を書くかどうか",
	],
	"no-default": [
		"Zod の .default() / .prefault() / .catch() を使わない",
		"references/pitfalls.md#.default() は既定値を検証しない",
	],
	"jsdoc-tags": [
		"JSDoc のタグは @throws（と @deprecated）だけにする",
		"references/comments.md#コメントの置き場",
	],
	"no-guard": [
		"型ガード（value is Xxx）を書かない",
		"references/model-code.md#入口を create と reconstruct に絞る",
	],
	"brand-symbol": [
		"ブランドを unique symbol で宣言する",
		"SKILL.md#中核の規則",
	],
	"brand-no-export": ["ブランドの記号を export しない", "SKILL.md#中核の規則"],
	"brand-output": [
		"ブランドは出力側だけに付ける（inout にしない）",
		"references/pitfalls.md#.brand() を inout にすると XxxSchemaInput が生の値で書けなくなる",
	],
	satisfies: [
		"safeParse に渡すオブジェクトリテラルに satisfies XxxSchemaInput を付ける",
		"references/model-code.md#satisfies を付ける場所",
	],
	"no-codec": [
		"z.codec を使わない",
		"references/persistence.md#インフラ層での値の生成と変換",
	],
	"no-in-source": [
		"実装ファイルに import.meta.vitest のブロックを置かない",
		"references/test-style-other.md#in-source testing",
	],
	"coverage-no-ignore": [
		"製品コードにカバレッジの除外コメントを置かない",
		"references/test-style-coverage.md#カバレッジ",
	],
	"helper-not-imported": [
		"本番コードからダミー生成ヘルパーを import しない",
		"references/test-style.md#置き場と命名",
	],
	"helper-no-test": [
		"ダミー生成ヘルパーにテストを登録しない",
		"references/test-style-helpers.md#ダミー生成ヘルパー",
	],
	"helper-exclude": [
		"vitest の設定の test.exclude で Xxx.helper.test.ts を外す",
		"references/test-style.md#置き場と命名",
	],
	"type-test-config": [
		"vitest の設定で typecheck を有効にする",
		"references/test-style-type-tests.md#型のテスト",
	],
	"type-test-file": [
		"型のテストは Xxx.test-d.ts に置く",
		"references/test-style-type-tests.md#型のテスト",
	],
	"type-test-single": [
		"型のテスト1つに @ts-expect-error を1つ置き、何を止めているかを書く",
		"references/test-style-type-tests.md#型のテスト",
	],
	"test-not-it": [
		"it ではなく test を使う",
		"references/test-style.md#置き場と命名",
	],
	"no-not-tothrow": [
		"成功を not.toThrow() で確かめない",
		"references/test-style.md#assertion の選び方",
	],
	"strict-equal": [
		"一致は toStrictEqual で比べ、toEqual を使わない",
		"references/test-style.md#assertion の選び方",
	],
	"table-for": [
		"テーブル駆動は test.for とオブジェクトの行で書く",
		"references/test-style.md#テーブル駆動",
	],
	"test-order": [
		"describe の中を 正常系 → 異常系 → 不変性 の順に並べる",
		"references/test-style.md#置き場と命名",
	],
	gwt: [
		"すべてのテストに // Given: // When: // Then: と説明を置く",
		"references/test-style.md#Given / When / Then",
	],
	"mock-name": [
		"モックの変数名は mock で始める",
		"references/test-style-mocks.md#クライアントのモック",
	],
	"await-rejects": [
		"rejects / resolves の expect には await を付ける",
		"references/test-style.md#非同期のとき",
	],
	"error-message-owned": [
		"業務のエラーの具象 class はメッセージを class の中で決める",
		"references/errors.md#エラー",
	],
	"error-fatal-shape": [
		"FatalUnreachableError は Error を直接継承し、cause を unknown で受ける",
		"references/errors.md#エラー",
	],
	"no-raw-error": [
		"組み込みの Error や文字列を throw しない",
		"references/errors.md#エラー",
	],
	"error-shared-no-model-import": [
		"共有のエラーのファイル shared-errors.ts は zod 以外を import しない（モデルの型を参照しない）",
		"references/errors.md#エラー",
	],
	"caught-position": [
		"例外を受ける変数を When の try の直上に置く",
		"references/test-style.md#例外の中身を見るとき",
	],
	"test-file-place": [
		"テストは対象の横の Xxx.test.ts に置く",
		"references/test-style.md#置き場と命名",
	],
	"test-describe-flat": [
		"観点で describe を入れ子にしない",
		"references/test-style.md#置き場と命名",
	],
	"error-message-form": [
		"スキーマとドメインエラーのメッセージは「です」「できません」で言い切る",
		"references/errors.md#エラー",
	],
	"test-name-prefix": [
		"テスト名は 正常系: / 異常系: / 不変性: / 型: で始める",
		"references/test-style.md#置き場と命名",
	],
	"test-name-predicate": [
		"テスト名は述語で終え、class 名・true / false・名詞で終えない",
		"references/test-style.md#置き場と命名",
	],
	"gwt-sentence": [
		"Given は「〜とき」、When は「〜と」、Then は結果の状態で終える",
		"references/test-style.md#説明の書き方",
	],
	"local-name": [
		"ローカル関数名は完全名（createXxx）にする",
		"references/naming.md#命名の表",
	],
	"dto-local-name": [
		"DTO のローカル関数名は完全名（to<DTO名>）にする",
		"references/naming.md#命名の表",
	],
	"jsdoc-class-word": [
		"class を指す語は「基底 class」のように class まで書く",
		"references/test-style.md#説明の書き方",
	],
	"impl-factory-name": [
		"インフラの実装の生成関数は createXxxImpl と名付ける",
		"references/persistence.md#公開の形",
	],
	"impl-factory-export": [
		"インフラの実装の生成関数を名前付きで export する",
		"references/persistence.md#公開の形",
	],
	"impl-deps-name": [
		"インフラの実装の依存の型は XxxImplDeps と名付ける",
		"references/naming.md#命名の表",
	],
	"dto-plain-export": [
		"DTO は公開 API のオブジェクトを作らず、変換を名前付きで export する",
		"references/persistence.md#公開の形",
	],
	"section-placement": [
		"「スキーマ・型定義」のセクションに関数を置かない",
		"references/model-code.md#型を置くセクション",
	],
	"throw-concrete": [
		"例外の種別は具象の class で確かめる",
		"references/test-style.md#例外の中身を見るとき",
	],
	"no-expect-in-catch": [
		"catch の中に expect を置かない",
		"references/test-style.md#例外の中身を見るとき",
	],
	"gwt-adjacent": [
		"When と Then を隣接させるのは matcher が対象操作を実行するときと型のテストだけ",
		"references/test-style.md#When と Then がくっつくとき",
	],
	"gwt-invalid-word": [
		"違反の内容を述べたうえで「不正な」を重ねない",
		"references/test-style.md#説明の書き方",
	],
	"gwt-no-var-name": [
		"説明とテスト名に変数名やテストコードの都合を出さない",
		"references/test-style.md#説明の書き方",
	],
	"expected-in-then": [
		"期待値は Then で組み立て、Given に置かない",
		"references/test-style.md#説明の書き方",
	],
	"one-call": [
		"1つのテストで対象操作を1回だけ呼ぶ",
		"references/test-style.md#1つのテストで確かめること",
	],
	"helper-reconstruct": [
		"ダミーの完成値は reconstruct で作る",
		"references/test-style-helpers.md#何を通して作るか",
	],
	"test-name-error-class": [
		"例外を確かめるテストの名前に期待する具象の class 名を入れる",
		"references/test-style.md#置き場と命名",
	],
	"table-name": [
		"展開後のテスト名に行ごとの入力の違いを出す",
		"references/test-style.md#テーブル駆動",
	],
};

// 型の解決に頼る判定。型を信用できないとき（typeUnreliable）は null にする
const TYPE_TAGS = new Set([
	"no-default",
	"error-message-owned",
	"error-fatal-shape",
	"no-raw-error",
	"error-message-form",
	"local-name",
	"dto-local-name",
	"throw-concrete",
	"test-name-error-class",
	"gwt-adjacent",
]);

// テストの呼び出し（test / it / describe）を見つけて判定するもの。
// テストのファイルなのにテストの呼び出しを1つも見つけられないときは、合格を null にする
const TEST_CALL_TAGS = new Set([
	"type-test-single",
	"test-not-it",
	"table-for",
	"test-order",
	"gwt",
	"caught-position",
	"test-describe-flat",
	"test-name-prefix",
	"test-name-predicate",
	"gwt-sentence",
	"gwt-adjacent",
	"gwt-invalid-word",
	"gwt-no-var-name",
	"expected-in-then",
	"one-call",
	"test-name-error-class",
	"table-name",
	"throw-concrete",
	"no-expect-in-catch",
]);
const testFilesWithoutCalls = testSources()
	.filter((s) => !isHelper(s.rel))
	.filter(
		(s) => testCalls(s.sf).length === 0 && describeCalls(s.sf).length === 0,
	)
	.map((s) => s.rel);

function finalize(r) {
	const [summary, ref] = RULES[r.tag] ?? [];
	let { passed, evidence } = r;
	if (TYPE_TAGS.has(r.tag) && typeUnreliable.length > 0 && passed !== null) {
		passed = null;
		evidence = `型を信用できないので決めない（${typeUnreliable.slice(0, 3).join("; ")}）。スクリプトの結果: ${evidence}`;
	}
	if (
		TEST_CALL_TAGS.has(r.tag) &&
		testFilesWithoutCalls.length > 0 &&
		passed === true
	) {
		passed = null;
		evidence = `テストの呼び出しを見つけられないテストのファイルがある（${testFilesWithoutCalls.slice(0, 3).join("・")}）。見つけた範囲では: ${evidence}`;
	}
	return { tag: r.tag, passed, evidence, summary, ref };
}

const wanted = args.tags ? args.tags.split(",") : Object.keys(checks);
const unknownTags = wanted.filter((t) => !(t in checks));
if (unknownTags.length > 0) {
	throw new Error(`判定できないタグ: ${unknownTags.join(", ")}`);
}
const results = wanted.map((tag) => finalize(checks[tag]()));
process.stdout.write(
	`${JSON.stringify(
		{
			outputs: outputsDir,
			files: judgedRel,
			...(missingFiles.length > 0 ? { missingFiles } : {}),
			...(typeUnreliable.length > 0 ? { typeUnreliable } : {}),
			results,
		},
		null,
		2,
	)}\n`,
);
