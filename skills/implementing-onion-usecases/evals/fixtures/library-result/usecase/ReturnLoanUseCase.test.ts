import { describe, expect, test, vi } from "vitest";
import { LoanStatusMismatchError } from "../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
	createDummyReturnedLoan,
} from "../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import { createReturnLoanUseCase } from "./ReturnLoanUseCase";
import { LoanNotFoundError } from "./shared-errors";

describe("ReturnLoanUseCase.run", () => {
	test("正常系: clock.now() の値で返却した Loan を保存する", async () => {
		// Given: 貸出中の Loan を返すリポジトリと、4000 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanUseCase({
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

		// Then: returned になった Loan が保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyReturnedLoan({ returnedAt: 4_000 }),
		);
	});

	test("正常系: 返却できたら Ok が返される", async () => {
		// Given: 貸出中の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却すると
		const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: 値の無い Ok が返される
		expect(result).toStrictEqual({ ok: true, value: undefined });
	});

	test("正常系: props の loanNumber で Loan を取得する", async () => {
		// Given: 貸出中の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan({ id: "LIB-7" }));
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanUseCase({
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

	test("異常系: Loan が無ければ LoanNotFoundError の Err が返され、保存しない", async () => {
		// Given: Loan を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const mockPut = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却すると
		const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotFoundError の Err が返され、保存は呼ばれない
		expect(result).toStrictEqual({
			ok: false,
			error: expect.any(LoanNotFoundError),
		});
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 予約済の Loan なら LoanStatusMismatchError の Err が返され、保存しない", async () => {
		// Given: reserved の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
		const mockPut = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPut,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});

		// When: 返却すると
		const result = await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanStatusMismatchError の Err が返され、保存は呼ばれない
		expect(result).toStrictEqual({
			ok: false,
			error: expect.any(LoanStatusMismatchError),
		});
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 保存先が reject したら Err にせず reject する", async () => {
		// Given: 保存で reject するリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockPut = vi.fn();
		mockPut.mockRejectedValueOnce(new Error("保存先に接続できません"));
		const usecase = createReturnLoanUseCase({
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

		// Then: 保存先のエラーで reject される
		await expect(pending).rejects.toThrow("保存先に接続できません");
	});
});
