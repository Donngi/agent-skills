import { z } from "zod";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type LibraryCode, LibraryCodeSchema } from "./LibraryCode";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LoanNumberBrand: unique symbol;

/** 貸出番号に入る連番の桁数。 */
const LOAN_SEQUENCE_DIGITS = 9;

/** 貸出番号に入る連番の最大値。採番する側はこれを超えないことを確かめる。 */
export const LOAN_SEQUENCE_MAX = 10 ** LOAN_SEQUENCE_DIGITS - 1;

const LOAN_SEQUENCE_PATTERN = new RegExp(
	`^[^-]*-[1-9][0-9]{0,${LOAN_SEQUENCE_DIGITS - 1}}$`,
);

/**
 * LoanNumber
 * 貸出の識別子。館ごとの連番になる。
 */
export const LoanNumberSchema = z
	// z.templateLiteral を先頭に置くと入力型が `${string}-${number}` になり、境界で as が要る。
	// z.string() で受けてから pipe すると入力型が string のままになる
	.string()
	.pipe(
		z.templateLiteral([LibraryCodeSchema, "-", z.number().int().positive()], {
			error: "貸出番号は LIB-123 の形です",
		}),
	)
	// z.templateLiteral は LibraryCodeSchema の regex と z.number() の int を検査するが、
	// positive は検査しない。LIB-0、LIB-01、LIB--1 が通るので番号を止める。
	// 区切りの直後から見ないと、LIB--1 の末尾の -1 に一致してしまう
	.refine((v) => LOAN_SEQUENCE_PATTERN.test(v), {
		error: `貸出番号は LIB-123 の形で、連番は${LOAN_SEQUENCE_DIGITS}桁までです`,
	})
	.brand<typeof LoanNumberBrand>();

export type LoanNumber = z.output<typeof LoanNumberSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLoanNumber(value: string): LoanNumber {
	const result = LoanNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("LoanNumber.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLoanNumber(value: string): LoanNumber {
	const result = LoanNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"LoanNumber.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 読み取り
// -------------------------------------------------

function loanNumberLibraryCode(id: LoanNumber): LibraryCode {
	const [prefix] = id.split("-");
	const result = LibraryCodeSchema.safeParse(prefix);
	if (!result.success) {
		throw new FatalUnreachableError("LoanNumber.libraryCode", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const LoanNumber = {
	create: createLoanNumber,
	reconstruct: reconstructLoanNumber,
	libraryCode: loanNumberLibraryCode,
} as const;
