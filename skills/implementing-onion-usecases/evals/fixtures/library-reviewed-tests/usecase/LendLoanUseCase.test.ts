import { describe, expect, test, vi } from "vitest";
import {
	Loan,
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
import { createLendLoanUseCase, LoanNotLendableError } from "./LendLoanUseCase";
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

describe("LendLoanUseCase.run", () => {
	test("正常系: 借りに来た利用者と clock.now() の値で貸し出した Loan を保存する", async () => {
		// Given: M-0002 が予約した Loan を返すリポジトリと、4000 を返す clock で
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
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: M-0002 に返却期限を 9000 にして貸し出すと
		await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId("M-0002"),
			dueAt: createDummyTimestamp(9_000),
		});

		// Then: lent になった Loan が保存される
		const expected = Loan.lend(
			createDummyReservedLoan({ memberId: "M-0002" }),
			{
				memberId: createDummyMemberId("M-0002"),
				at: createDummyTimestamp(4_000),
				dueAt: createDummyTimestamp(9_000),
			},
		);
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(expected);
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生する", async () => {
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
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 貸出を始めると
		const pending = usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(9_000),
		});

		// Then: LoanNotFoundError が発生する
		await expect(pending).rejects.toThrow(LoanNotFoundError);
	});

	test("異常系: 貸出中の Loan なら LoanNotLendableError が発生し、保存しない", async () => {
		// Given: lent の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockPut = vi.fn();
		const usecase = createLendLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 貸出を始めると
		const pending = usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(9_000),
		});

		// Then: LoanNotLendableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanNotLendableError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 貸出中の Loan なら、LoanNotLendableError の cause に LoanStatusMismatchError が入る", async () => {
		// Given: lent の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const usecase = createLendLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 貸出を始めると
		const pending = usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(9_000),
		});

		// Then: cause に、状態の不一致を表す LoanStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(LoanStatusMismatchError),
		});
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
