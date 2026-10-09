import { describe, expect, test } from "vitest";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { LoanNotFoundError } from "./shared-errors";

describe("LoanNotFoundError", () => {
	test("正常系: 貸出番号を含むメッセージになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: メッセージに貸出番号が含まれる
		expect(error.message).toContain("LIB-42");
	});
});
