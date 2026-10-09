import { describe, expect, test, vi } from "vitest";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
	createDummyReturnedLoan,
} from "../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createGetLoanUseCase } from "./GetLoanUseCase";
import { LoanNotFoundError } from "./shared-errors";

describe("GetLoanUseCase.run", () => {
	test.for([
		{
			name: "reserved",
			loan: createDummyReservedLoan({ memo: "窓口で受け取り" }),
			expected: {
				loanNumber: "LIB-1",
				bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
				memberId: "M-0001",
				memo: "窓口で受け取り",
				status: "reserved",
				holdUntil: 5_000,
			},
		},
		{
			name: "lent",
			loan: createDummyLentLoan(),
			expected: {
				loanNumber: "LIB-1",
				bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
				memberId: "M-0001",
				status: "lent",
				lentAt: 2_000,
				dueAt: 9_000,
			},
		},
		{
			name: "returned",
			loan: createDummyReturnedLoan(),
			expected: {
				loanNumber: "LIB-1",
				bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
				memberId: "M-0001",
				status: "returned",
				lentAt: 2_000,
				dueAt: 9_000,
				returnedAt: 3_000,
			},
		},
	])(
		"正常系: $name の Loan はその各プロパティを持つ Result になる",
		async ({ loan, expected }) => {
			// Given: その状態の Loan を返すリポジトリで
			const mockGet = vi.fn();
			mockGet.mockResolvedValueOnce(loan);
			const usecase = createGetLoanUseCase({
				loanRepository: {
					get: mockGet,
					listByLibrary: vi.fn(),
					listByMember: vi.fn(),
					put: vi.fn(),
				},
			});

			// When: Loan を取得すると
			const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

			// Then: その Loan の各プロパティを持つ Result と一致する
			expect(result).toStrictEqual(expected);
		},
	);

	test("正常系: メモの無い Loan なら memo のキーを持たない", async () => {
		// Given: メモの無い reserved の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
		const usecase = createGetLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
		});

		// When: Loan を取得すると
		const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: Result に memo のキーが無い
		expect("memo" in result).toBe(false);
	});

	test("正常系: lent の Loan なら holdUntil のキーを持たない", async () => {
		// Given: lent の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const usecase = createGetLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
		});

		// When: Loan を取得すると
		const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: Result に holdUntil のキーが無い
		expect(Reflect.get(result, "holdUntil")).toBeUndefined();
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生する", async () => {
		// Given: Loan を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const usecase = createGetLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
		});

		// When: Loan の取得を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotFoundError が発生する
		await expect(pending).rejects.toThrow(LoanNotFoundError);
	});
});
