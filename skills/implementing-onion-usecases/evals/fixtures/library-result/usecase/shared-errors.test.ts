import { describe, expect, test } from "vitest";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

describe("LoanNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"ReturnLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と LoanNumber が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"ReturnLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
		);

		// Then: 操作名と LoanNumber が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "ReturnLoanUseCase.run",
			loanNumber: "LIB-12",
		});
	});

	test("正常系: name が LoanNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"ReturnLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotFoundError");
	});
});
