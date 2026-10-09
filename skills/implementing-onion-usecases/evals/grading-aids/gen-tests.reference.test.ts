import { describe, expect, test, vi } from "vitest";
import { BookStatusMismatchError } from "../domain/entity/Book";
import { createDummyBook } from "../domain/entity/Book.helper.test";
import {
	LoanReturnedBeforeLendingError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import {
	createDummyLentLoan,
	createDummyReturnedLoan,
} from "../domain/entity/Loan.helper.test";
import { createDummyBookId } from "../domain/value-object/BookId.helper.test";
import { createDummyLoanNumber } from "../domain/value-object/LoanNumber.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import {
	BookNotFoundError,
	BookNotShelvableError,
	createReturnLoanWithBookUseCase,
	LoanNotFoundError,
	LoanNotReturnableError,
} from "./ReturnLoanWithBookUseCase";
import { UseCaseError } from "./shared-errors";

describe("ReturnLoanWithBookUseCase.run", () => {
	test("正常系: clock.now() の値を返却日にして返却した Loan を保存する", async () => {
		// Given: 貸出中の Loan と Book を返すリポジトリと、5000 を返す clock で
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockLoanPut = vi.fn();
		mockLoanPut.mockResolvedValueOnce(undefined);
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockBookPut = vi.fn();
		mockBookPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: 返却日 5000 の returned の Loan が1回だけ保存される
		expect(mockLoanPut).toHaveBeenCalledTimes(1);
		expect(mockLoanPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyReturnedLoan({ returnedAt: 5_000 }),
		);
	});

	test("正常系: onShelf に戻した Book を保存する", async () => {
		// Given: 貸出中の Loan と Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockLoanPut = vi.fn();
		mockLoanPut.mockResolvedValueOnce(undefined);
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockBookPut = vi.fn();
		mockBookPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: onShelf の Book が1回だけ保存される
		expect(mockBookPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyBook({ status: "onShelf" }),
		);
		expect(mockBookPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の loanNumber で Loan を取得する", async () => {
		// Given: 貸出中の Loan と Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan({ id: "LIB-7" }));
		const mockLoanPut = vi.fn();
		mockLoanPut.mockResolvedValueOnce(undefined);
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockBookPut = vi.fn();
		mockBookPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: LIB-7 を返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber("LIB-7") });

		// Then: LIB-7 で Loan を取得している
		expect(mockLoanGet).toHaveBeenCalledWith(createDummyLoanNumber("LIB-7"));
	});

	test("正常系: 取得した Loan の bookId で Book を取得する", async () => {
		// Given: 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed の Book を貸し出している Loan と、その Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(
			createDummyLentLoan({ bookId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed" }),
		);
		const mockLoanPut = vi.fn();
		mockLoanPut.mockResolvedValueOnce(undefined);
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(
			createDummyBook({
				id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
				status: "onLoan",
			}),
		);
		const mockBookPut = vi.fn();
		mockBookPut.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: Loan の bookId で Book を取得している
		expect(mockBookGet).toHaveBeenCalledWith(
			createDummyBookId("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"),
		);
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生し、Book を取得せず何も保存しない", async () => {
		// Given: Loan を返さないリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(undefined);
		const mockLoanPut = vi.fn();
		const mockBookGet = vi.fn();
		const mockBookPut = vi.fn();
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotFoundError が発生し、Book の取得も保存も呼ばれない
		await expect(pending).rejects.toThrow(LoanNotFoundError);
		expect(mockBookGet).not.toHaveBeenCalled();
		expect(mockLoanPut).not.toHaveBeenCalled();
		expect(mockBookPut).not.toHaveBeenCalled();
	});

	test("異常系: Book が無ければ BookNotFoundError が発生し、何も保存しない", async () => {
		// Given: 貸出中の Loan を返し、Book を返さないリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockLoanPut = vi.fn();
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(undefined);
		const mockBookPut = vi.fn();
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: BookNotFoundError が発生し、Loan も Book も保存されない
		await expect(pending).rejects.toThrow(BookNotFoundError);
		expect(mockLoanPut).not.toHaveBeenCalled();
		expect(mockBookPut).not.toHaveBeenCalled();
	});

	test("異常系: 返却済みの Loan なら LoanNotReturnableError が発生し、何も保存しない", async () => {
		// Given: returned の Loan と貸出中の Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyReturnedLoan());
		const mockLoanPut = vi.fn();
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockBookPut = vi.fn();
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotReturnableError が発生し、Loan も Book も保存されない
		await expect(pending).rejects.toThrow(LoanNotReturnableError);
		expect(mockLoanPut).not.toHaveBeenCalled();
		expect(mockBookPut).not.toHaveBeenCalled();
	});

	test("異常系: 返却済みの Loan なら、LoanNotReturnableError の cause に LoanStatusMismatchError が入る", async () => {
		// Given: returned の Loan と貸出中の Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyReturnedLoan());
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
			bookRepository: { get: mockBookGet, put: vi.fn() },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: cause に、状態の不一致を表す LoanStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(LoanStatusMismatchError),
		});
	});

	test("異常系: 貸出中でない Book なら BookNotShelvableError が発生し、Loan も Book も保存しない", async () => {
		// Given: 貸出中の Loan と、棚にある Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockLoanPut = vi.fn();
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onShelf" }));
		const mockBookPut = vi.fn();
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: BookNotShelvableError が発生し、Loan も Book も保存されない
		await expect(pending).rejects.toThrow(BookNotShelvableError);
		expect(mockLoanPut).not.toHaveBeenCalled();
		expect(mockBookPut).not.toHaveBeenCalled();
	});

	test("異常系: 貸出中でない Book なら、BookNotShelvableError の cause に BookStatusMismatchError が入る", async () => {
		// Given: 貸出中の Loan と、棚にある Book を返すリポジトリで
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan());
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onShelf" }));
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
			bookRepository: { get: mockBookGet, put: vi.fn() },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: cause に、状態の不一致を表す BookStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(BookStatusMismatchError),
		});
	});

	test("異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、何も保存しない", async () => {
		// Given: 2000 に貸し出した Loan と貸出中の Book を返すリポジトリと、1000 を返す clock で
		const mockLoanGet = vi.fn();
		mockLoanGet.mockResolvedValueOnce(createDummyLentLoan({ lentAt: 2_000 }));
		const mockLoanPut = vi.fn();
		const mockBookGet = vi.fn();
		mockBookGet.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockBookPut = vi.fn();
		const usecase = createReturnLoanWithBookUseCase({
			loanRepository: {
				get: mockLoanGet,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockLoanPut,
			},
			bookRepository: { get: mockBookGet, put: mockBookPut },
			clock: { now: () => createDummyTimestamp(1_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanReturnedBeforeLendingError が詰め替えられずに発生し、Loan も Book も保存されない
		await expect(pending).rejects.toThrow(LoanReturnedBeforeLendingError);
		expect(mockLoanPut).not.toHaveBeenCalled();
		expect(mockBookPut).not.toHaveBeenCalled();
	});
});

describe("LoanNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"ReturnLoanWithBookUseCase.run",
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
			"ReturnLoanWithBookUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: 操作名と LoanNumber が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "ReturnLoanWithBookUseCase.run",
			loanNumber: "LIB-42",
		});
	});

	test("正常系: name が LoanNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と LoanNumber でエラーを作ると
		const error = new LoanNotFoundError(
			"ReturnLoanWithBookUseCase.run",
			createDummyLoanNumber("LIB-42"),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotFoundError");
	});
});

describe("BookNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と BookId でエラーを作ると
		const error = new BookNotFoundError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と BookId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と BookId でエラーを作ると
		const error = new BookNotFoundError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
		);

		// Then: 操作名と BookId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "ReturnLoanWithBookUseCase.run",
			bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
		});
	});

	test("正常系: name が BookNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と BookId でエラーを作ると
		const error = new BookNotFoundError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("BookNotFoundError");
	});
});

describe("LoanNotReturnableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new LoanStatusMismatchError(
			"Loan.return",
			createDummyLoanNumber("LIB-42"),
			"lent",
			"returned",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyLoanNumber("LIB-42"),
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
			createDummyLoanNumber("LIB-42"),
			"lent",
			"returned",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: 操作名と LoanNumber が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "ReturnLoanWithBookUseCase.run",
			loanNumber: "LIB-42",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が LoanNotReturnableError になる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new LoanStatusMismatchError(
			"Loan.return",
			createDummyLoanNumber("LIB-42"),
			"lent",
			"returned",
		);

		// When: 操作名と LoanNumber と cause でエラーを作ると
		const error = new LoanNotReturnableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("LoanNotReturnableError");
	});
});

describe("BookNotShelvableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new BookStatusMismatchError(
			"Book.returnToShelf",
			createDummyBookId(),
			"onLoan",
			"onShelf",
		);

		// When: 操作名と BookId と cause でエラーを作ると
		const error = new BookNotShelvableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と BookId と cause が渡した値のまま残る", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new BookStatusMismatchError(
			"Book.returnToShelf",
			createDummyBookId(),
			"onLoan",
			"onShelf",
		);

		// When: 操作名と BookId と cause でエラーを作ると
		const error = new BookNotShelvableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
			{ cause },
		);

		// Then: 操作名と BookId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "ReturnLoanWithBookUseCase.run",
			bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が BookNotShelvableError になる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new BookStatusMismatchError(
			"Book.returnToShelf",
			createDummyBookId(),
			"onLoan",
			"onShelf",
		);

		// When: 操作名と BookId と cause でエラーを作ると
		const error = new BookNotShelvableError(
			"ReturnLoanWithBookUseCase.run",
			createDummyBookId(),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("BookNotShelvableError");
	});
});
