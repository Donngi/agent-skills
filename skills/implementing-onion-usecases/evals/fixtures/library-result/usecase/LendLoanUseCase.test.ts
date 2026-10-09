import { describe, expect, test, vi } from "vitest";
import * as z from "zod";
import { LoanMemberMismatchError } from "../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
} from "../domain/entity/Loan.helper.test";
import { InvalidReconstructParamError } from "../domain/shared-errors";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createDummyMemberId } from "../domain/value-object/MemberId.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import { createLendLoanUseCase } from "./LendLoanUseCase";
import { LoanNotFoundError } from "./shared-errors";

describe("LendLoanUseCase.run", () => {
	test("正常系: clock.now() の値と返却期限で貸し出した Loan を保存する", async () => {
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

		// When: M-0002 に返却期限 10000 で貸し出すと
		await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId("M-0002"),
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: lent になった Loan が保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyLentLoan({ memberId: "M-0002", lentAt: 3_000, dueAt: 10_000 }),
		);
	});

	test("正常系: 貸し出せたら Ok が返される", async () => {
		// Given: 予約済の Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
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

		// When: 貸し出すと
		const result = await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: 値の無い Ok が返される
		expect(result).toStrictEqual({ ok: true, value: undefined });
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
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: LIB-7 で Loan を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyLoanNumber("LIB-7"));
	});

	test("異常系: Loan が無ければ LoanNotFoundError の Err が返され、保存しない", async () => {
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

		// When: 貸し出すと
		const result = await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId(),
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: LoanNotFoundError の Err が返され、保存は呼ばれない
		expect(result).toStrictEqual({
			ok: false,
			error: expect.any(LoanNotFoundError),
		});
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 予約した利用者と別の利用者なら LoanMemberMismatchError の Err が返され、保存しない", async () => {
		// Given: M-0001 が予約した Loan を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyReservedLoan());
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

		// When: M-0002 に貸し出すと
		const result = await usecase.run({
			loanNumber: createDummyLoanNumber(),
			memberId: createDummyMemberId("M-0002"),
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: LoanMemberMismatchError の Err が返され、保存は呼ばれない
		expect(result).toStrictEqual({
			ok: false,
			error: expect.any(LoanMemberMismatchError),
		});
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: リポジトリが InvalidReconstructParamError で reject したら Err にせず reject する", async () => {
		// Given: 壊れた保存値で reject するリポジトリで
		const mockGet = vi.fn();
		mockGet.mockRejectedValueOnce(
			new InvalidReconstructParamError("Loan.reconstruct", new z.ZodError([])),
		);
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
			dueAt: createDummyTimestamp(10_000),
		});

		// Then: InvalidReconstructParamError で reject され、保存は呼ばれない
		await expect(pending).rejects.toThrow(InvalidReconstructParamError);
		expect(mockPut).not.toHaveBeenCalled();
	});
});
