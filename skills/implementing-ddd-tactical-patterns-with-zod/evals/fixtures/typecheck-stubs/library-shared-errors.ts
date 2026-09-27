// build.py --typecheck だけが使う、共有のエラー定義の最小の代役。受験者には渡さない。
// 15番（gen-errors）は shared-errors.ts を受験者に書かせるので、渡す値オブジェクトが
// import している名前だけを持つ代役を置いて、files だけで型検査が通ることを確かめる
import type * as z from "zod";

export abstract class DomainError extends Error {
	abstract override readonly name: string;
}

export class InvalidCreationParamError extends DomainError {
	override readonly name: string = "InvalidCreationParamError";
	constructor(_operation: string, _cause: z.ZodError) {
		super();
	}
}

export class InvalidReconstructParamError extends DomainError {
	override readonly name: string = "InvalidReconstructParamError";
	constructor(_operation: string, _cause: z.ZodError) {
		super();
	}
}

export class FatalUnreachableError extends Error {
	override readonly name: string = "FatalUnreachableError";
	constructor(_operation: string, _cause?: unknown) {
		super();
	}
}
