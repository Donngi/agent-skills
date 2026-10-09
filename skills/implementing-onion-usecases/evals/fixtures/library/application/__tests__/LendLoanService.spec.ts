import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoanMemberMismatchError } from "../../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReservedLoan,
} from "../../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../../domain/value-object/LoanNumber.helper.test";
import { createDummyMemberId } from "../../domain/value-object/MemberId.helper.test";
import { createDummyTimestamp } from "../../domain/value-object/Timestamp.helper.test";
import { LoanNotFoundError } from "../errors";
import { type LendLoanService, makeLendLoanService } from "../LendLoanService";

describe("LendLoanService", () => {
	const get = vi.fn();
	const put = vi.fn();
	let service: LendLoanService;

	beforeEach(() => {
		get.mockReset();
		put.mockReset();
		service = makeLendLoanService({
			loanRepository: {
				get,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put,
			},
			clock: { now: () => createDummyTimestamp(3_000) },
		});
	});

	describe("execute", () => {
		describe("予約済の貸出のとき", () => {
			beforeEach(() => {
				get.mockResolvedValue(createDummyReservedLoan());
			});

			it("貸出日と返却期限を入れた貸出を保存する", async () => {
				await service.execute({
					loanNumber: createDummyLoanNumber(),
					memberId: createDummyMemberId(),
					dueAt: createDummyTimestamp(10_000),
				});

				expect(put).toHaveBeenCalledWith(
					createDummyLentLoan({ lentAt: 3_000, dueAt: 10_000 }),
				);
			});

			it("予約した利用者と別の利用者なら LoanMemberMismatchError で失敗する", async () => {
				await expect(
					service.execute({
						loanNumber: createDummyLoanNumber(),
						memberId: createDummyMemberId("M-0002"),
						dueAt: createDummyTimestamp(10_000),
					}),
				).rejects.toBeInstanceOf(LoanMemberMismatchError);
				expect(put).not.toHaveBeenCalled();
			});
		});

		describe("貸出が無いとき", () => {
			beforeEach(() => {
				get.mockResolvedValue(undefined);
			});

			it("LoanNotFoundError で失敗する", async () => {
				await expect(
					service.execute({
						loanNumber: createDummyLoanNumber(),
						memberId: createDummyMemberId(),
						dueAt: createDummyTimestamp(10_000),
					}),
				).rejects.toBeInstanceOf(LoanNotFoundError);
				expect(put).not.toHaveBeenCalled();
			});
		});
	});
});
