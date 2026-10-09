import { describe, expect, test, vi } from "vitest";
import {
	LoanDueBeforeLendingError,
	LoanMemberMismatchError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
} from "../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createDummyMemberId } from "../domain/value-object/MemberId.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import {
	createLendLoanUseCase,
	LoanNotFoundError,
	LoanNotLendableError,
} from "./LendLoanUseCase";
import { UseCaseError } from "./shared-errors";

describe("LendLoanUseCase.run", () => {
	test("正常系: clock.now() の値を貸出日にして貸し出した Loan を保存する", async () => {
		// Given: M-0002 が予約した Loan を返すリポジトリと、3000 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(
			createDummyReservedLoan({ memberId: "M-0002" }),
		);
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createLendLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(3_000) },
		});

		// When: M-0002 に返却期限 8000 で貸し出すと
		await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId("M-0002"),
			dueAt: createDummyTimestamp(8_000),
		});

		// Then: 貸出日 3000・返却期限 8000 の lent の Loan が1回だけ保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyLentLoan({ memberId: "M-0002", lentAt: 3_000, dueAt: 8_000 }),
		);
		expect(mockPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の loanNumber で Loan を取得する", async () => {
		// Given: 予約済の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan({ id: "LIB-7" }));
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createLendLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(3_000) },
		});

		// When: LIB-7 を貸し出すと
		await usecase.run({
			loanNumber: createDummyLoanNumber("LIB-7"),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(8_000),
		});

		// Then: LIB-7 で Loan を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyLoanNumber("LIB-7"));
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生し、保存しない", async () => {
		// Given: Loan を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const mockPut = vi.fn();
		const usecase = createLendLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(3_000) },
		});

		// When: 貸出を始めると
		const pending = usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(8_000),
		});

		// Then: LoanNotFoundError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanNotFoundError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test.for([
		{
			name: "Loan が貸出中なら",
			loan: createDummyLentLoan({ memberId: "M-0002" }),
			dueAt: 8_000,
		},
		{
			name: "予約した利用者と別の利用者なら",
			loan: createDummyReservedLoan(),
			dueAt: 8_000,
		},
		{
			name: "返却期限が clock の値より前なら",
			loan: createDummyReservedLoan({ memberId: "M-0002" }),
			dueAt: 2_000,
		},
	])(
		"異常系: $name LoanNotLendableError が発生し、保存しない",
		async ({ loan, dueAt }) => {
			// Given: その Loan を返すリポジトリと、3000 を返す clock で
			const mockGet = vi.fn();
			mockGet.mockResolvedValueOnce(loan);
			const mockPut = vi.fn();
			const usecase = createLendLoanUseCase({
				loanRepository: {
					get: mockGet,
					listByLibrary: vi.fn(),
					listByMember: vi.fn(),
					put: mockPut,
				},
				clock: { now: () => createDummyTimestamp(3_000) },
			});

			// When: M-0002 にその返却期限で貸し出すと
			const pending = usecase.run({
				loanNumber: createDummyLoanNumber(),
				memberId: createDummyMemberId("M-0002"),
				dueAt: createDummyTimestamp(dueAt),
			});

			// Then: LoanNotLendableError が発生し、保存は呼ばれない
			await expect(pending).rejects.toThrow(LoanNotLendableError);
			expect(mockPut).not.toHaveBeenCalled();
		},
	);

	test.for([
		{
			name: "Loan が貸出中なら",
			loan: createDummyLentLoan({ memberId: "M-0002" }),
			dueAt: 8_000,
			cause: LoanStatusMismatchError,
		},
		{
			name: "予約した利用者と別の利用者なら",
			loan: createDummyReservedLoan(),
			dueAt: 8_000,
			cause: LoanMemberMismatchError,
		},
		{
			name: "返却期限が clock の値より前なら",
			loan: createDummyReservedLoan({ memberId: "M-0002" }),
			dueAt: 2_000,
			cause: LoanDueBeforeLendingError,
		},
	])(
		"異常系: $name、LoanNotLendableError の cause に、その理由を表すドメインのエラーが入る",
		async ({ loan, dueAt, cause }) => {
			// Given: その Loan を返すリポジトリと、3000 を返す clock で
			const mockGet = vi.fn();
			mockGet.mockResolvedValueOnce(loan);
			const usecase = createLendLoanUseCase({
				loanRepository: {
					get: mockGet,
					listByLibrary: vi.fn(),
					listByMember: vi.fn(),
					put: vi.fn(),
				},
				clock: { now: () => createDummyTimestamp(3_000) },
			});

			// When: M-0002 にその返却期限で貸し出すと
			const pending = usecase.run({
				loanNumber: createDummyLoanNumber(),
				memberId: createDummyMemberId("M-0002"),
				dueAt: createDummyTimestamp(dueAt),
			});

			// Then: cause に、その理由を表すドメインのエラーが入っている
			await expect(pending).rejects.toMatchObject({
				cause: expect.any(cause),
			});
		},
	);
});

describe("LoanNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と LoanNumber が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: 操作名と LoanNumber が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "LendLoanUseCase.run",
			loanNumber: "LIB-42",
		});
	});

	test("正常系: name が LoanNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotFoundError");
	});
});

describe("LoanNotLendableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 利用者の不一致を表すドメインのエラーがあるとき
		const cause = new LoanMemberMismatchError(
			"Loan.lend",
			createDummyLoanNumber("LIB-42"),
			createDummyMemberId("M-0001"),
			createDummyMemberId("M-0002"),
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotLendableError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と LoanNumber と cause が渡した値のまま残る", () => {
		// Given: 利用者の不一致を表すドメインのエラーがあるとき
		const cause = new LoanMemberMismatchError(
			"Loan.lend",
			createDummyLoanNumber("LIB-42"),
			createDummyMemberId("M-0001"),
			createDummyMemberId("M-0002"),
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotLendableError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: 操作名と LoanNumber が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "LendLoanUseCase.run",
			loanNumber: "LIB-42",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が LoanNotLendableError になる", () => {
		// Given: 利用者の不一致を表すドメインのエラーがあるとき
		const cause = new LoanMemberMismatchError(
			"Loan.lend",
			createDummyLoanNumber("LIB-42"),
			createDummyMemberId("M-0001"),
			createDummyMemberId("M-0002"),
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotLendableError(
			"LendLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotLendableError");
	});
});
