import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoanStatusMismatchError } from "../../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReturnedLoan,
} from "../../domain/entity/Loan.helper.test";
import { createDummyLoanNumber } from "../../domain/value-object/LoanNumber.helper.test";
import { createDummyTimestamp } from "../../domain/value-object/Timestamp.helper.test";
import { LoanNotFoundError } from "../errors";
import {
	makeReturnLoanService,
	type ReturnLoanService,
} from "../ReturnLoanService";

describe("ReturnLoanService", () => {
	const get = vi.fn();
	const put = vi.fn();
	let service: ReturnLoanService;

	beforeEach(() => {
		get.mockReset();
		put.mockReset();
		service = makeReturnLoanService({
			loanRepository: {
				get,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put,
			},
			clock: { now: () => createDummyTimestamp(4_000) },
		});
	});

	describe("execute", () => {
		describe("貸出中の貸出のとき", () => {
			beforeEach(() => {
				get.mockResolvedValue(createDummyLentLoan());
			});

			it("返却日を入れた貸出を保存する", async () => {
				await service.execute({ loanNumber: createDummyLoanNumber() });

				expect(put).toHaveBeenCalledWith(
					createDummyReturnedLoan({ returnedAt: 4_000 }),
				);
			});
		});

		describe("返却済の貸出のとき", () => {
			beforeEach(() => {
				get.mockResolvedValue(createDummyReturnedLoan());
			});

			it("LoanStatusMismatchError で失敗する", async () => {
				await expect(
					service.execute({ loanNumber: createDummyLoanNumber() }),
				).rejects.toBeInstanceOf(LoanStatusMismatchError);
				expect(put).not.toHaveBeenCalled();
			});
		});

		describe("貸出が無いとき", () => {
			beforeEach(() => {
				get.mockResolvedValue(undefined);
			});

			it("LoanNotFoundError で失敗する", async () => {
				await expect(
					service.execute({ loanNumber: createDummyLoanNumber() }),
				).rejects.toBeInstanceOf(LoanNotFoundError);
				expect(put).not.toHaveBeenCalled();
			});
		});
	});
});
