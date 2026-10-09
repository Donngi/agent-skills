import { describe, expect, test, vi } from "vitest";
import {
	LoanReturnedBeforeLendingError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
	createDummyReturnedLoan,
} from "../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import {
	createReturnLentLoanUseCase,
	LoanNotReturnableError,
} from "./ReturnLentLoanUseCase";
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

describe("ReturnLentLoanUseCase.run", () => {
	test("正常系: clock.now() の値で返却した Loan を保存する", async () => {
		// Given: 貸出中の Loan を返すリポジトリと、4000 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: returned になった Loan が1回だけ保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyReturnedLoan({ returnedAt: 4_000 }),
		);
		expect(mockPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の loanNumber で Loan を取得する", async () => {
		// Given: 貸出中の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan({ id: "LIB-7" }));
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: LIB-7 を返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber("LIB-7") });

		// Then: LIB-7 で Loan を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyLoanNumber("LIB-7"));
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生し、保存しない", async () => {
		// Given: Loan を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const mockPut = vi.fn();
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotFoundError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanNotFoundError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 予約済の Loan なら LoanNotReturnableError が発生し、保存しない", async () => {
		// Given: reserved の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
		const mockPut = vi.fn();
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotReturnableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanNotReturnableError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 予約済の Loan なら、LoanNotReturnableError の cause に LoanStatusMismatchError が入る", async () => {
		// Given: reserved の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: cause に、状態の不一致を表す LoanStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(LoanStatusMismatchError),
		});
	});

	test("異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、保存しない", async () => {
		// Given: 2000 に貸し出した Loan を返すリポジトリと、1000 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan({ lentAt: 2_000 }));
		const mockPut = vi.fn();
		const usecase = createReturnLentLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(1_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanReturnedBeforeLendingError が詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanReturnedBeforeLendingError);
		expect(mockPut).not.toHaveBeenCalled();
	});
});

describe("LoanNotReturnableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new LoanStatusMismatchError(
			"Loan.return",
			createDummyLoanNumber("LIB-12"),
			"lent",
			"reserved",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLentLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と LoanNumber と cause が渡した値のまま残る", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new LoanStatusMismatchError(
			"Loan.return",
			createDummyLoanNumber("LIB-12"),
			"lent",
			"reserved",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLentLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
			{ cause },
		);

		// Then: 操作名と LoanNumber が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "ReturnLentLoanUseCase.run",
			loanNumber: "LIB-12",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が LoanNotReturnableError になる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new LoanStatusMismatchError(
			"Loan.return",
			createDummyLoanNumber("LIB-12"),
			"lent",
			"reserved",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLentLoanUseCase.run",
			createDummyLoanNumber("LIB-12"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotReturnableError");
	});
});
