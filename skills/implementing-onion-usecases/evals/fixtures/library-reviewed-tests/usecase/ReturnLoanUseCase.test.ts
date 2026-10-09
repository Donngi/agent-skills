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
	createReturnLoanUseCase,
	LoanNotReturnableError,
} from "./ReturnLoanUseCase";
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

describe("ReturnLoanUseCase.run", () => {
	test("正常系: clock.now() の値で返却した Loan を保存する", async () => {
		// Given: lent の Loan と onLoan の Book を返すリポジトリと、5000 を返す clock で
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyLentLoan());
		const mockPutLoan = vi.fn();
		mockPutLoan.mockResolvedValueOnce(undefined);
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockPutBook = vi.fn();
		mockPutBook.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: returned になった Loan が保存される
		expect(mockPutLoan.mock.calls[0]?.[0]).toStrictEqual(
			createDummyReturnedLoan({ returnedAt: 5_000 }),
		);
	});

	test("正常系: 棚に戻した Book を保存する", async () => {
		// Given: lent の Loan と onLoan の Book を返すリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyLentLoan());
		const mockPutLoan = vi.fn();
		mockPutLoan.mockResolvedValueOnce(undefined);
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockPutBook = vi.fn();
		mockPutBook.mockResolvedValueOnce(undefined);
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却すると
		await usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: onShelf になった Book が保存される
		expect(mockPutBook.mock.calls[0]?.[0]).toEqual(
			createDummyBook({ status: "onShelf" }),
		);
	});

	test("異常系: Loan が無ければ LoanNotFoundError が発生し、保存しない", async () => {
		// Given: Loan を返さないリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(undefined);
		const mockPutLoan = vi.fn();
		const mockPutBook = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: vi.fn(), put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanNotFoundError が発生し、保存は呼ばれない
		expect(pending)
			.rejects.toThrow(LoanNotFoundError)
			.then(() => {
				expect(mockPutLoan).not.toHaveBeenCalled();
				expect(mockPutBook).not.toHaveBeenCalled();
			});
	});

	test("異常系: Book が無ければ BookNotFoundError が発生し、保存しない", async () => {
		// Given: lent の Loan を返し、Book を返さないリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyLentLoan());
		const mockPutLoan = vi.fn();
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(undefined);
		const mockPutBook = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: BookNotFoundError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(BookNotFoundError);
		expect(mockPutLoan).not.toHaveBeenCalled();
		expect(mockPutBook).not.toHaveBeenCalled();
	});

	test("異常系: 返却済みの Loan ならユースケースのエラーが発生し、保存しない", async () => {
		// Given: returned の Loan と onLoan の Book を返すリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyReturnedLoan());
		const mockPutLoan = vi.fn();
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockPutBook = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: ユースケースのエラーが発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(UseCaseError);
		expect(mockPutLoan).not.toHaveBeenCalled();
		expect(mockPutBook).not.toHaveBeenCalled();
	});

	test("異常系: 返却済みの Loan なら、LoanNotReturnableError の cause に LoanStatusMismatchError が入る", async () => {
		// Given: returned の Loan と onLoan の Book を返すリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyReturnedLoan());
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: vi.fn(),
			},
			bookRepository: { get: mockGetBook, put: vi.fn() },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: cause に、状態の不一致を表す LoanStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(LoanStatusMismatchError),
		});
	});

	test("異常系: 貸出中でない Book なら BookNotShelvableError が発生し、保存しない", async () => {
		// Given: lent の Loan と onShelf の Book を返すリポジトリで
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyLentLoan());
		const mockPutLoan = vi.fn();
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onShelf" }));
		const mockPutBook = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: BookNotShelvableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(BookNotShelvableError);
		expect(mockPutLoan).not.toHaveBeenCalled();
		expect(mockPutBook).not.toHaveBeenCalled();
	});

	test("異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、保存しない", async () => {
		// Given: 2000 に貸し出した Loan と onLoan の Book を返すリポジトリと、1000 を返す clock で
		const mockGetLoan = vi.fn();
		mockGetLoan.mockResolvedValueOnce(createDummyLentLoan({ lentAt: 2_000 }));
		const mockPutLoan = vi.fn();
		const mockGetBook = vi.fn();
		mockGetBook.mockResolvedValueOnce(createDummyBook({ status: "onLoan" }));
		const mockPutBook = vi.fn();
		const usecase = createReturnLoanUseCase({
			loanRepository: {
				get: mockGetLoan,
				listByLibrary: vi.fn(),
				listByMember: vi.fn(),
				put: mockPutLoan,
			},
			bookRepository: { get: mockGetBook, put: mockPutBook },
			clock: { now: () => createDummyTimestamp(1_000) },
		});

		// When: 返却を始めると
		const pending = usecase.run({ loanNumber: createDummyLoanNumber() });

		// Then: LoanReturnedBeforeLendingError が詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(LoanReturnedBeforeLendingError);
		expect(mockPutLoan).not.toHaveBeenCalled();
		expect(mockPutBook).not.toHaveBeenCalled();
	});
});

describe("BookNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と BookId でエラーを作ると
		const error = new BookNotFoundError(
			"ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
			createDummyBookId("0e7a6f3c-2b1d-4c8e-9a5f-6b4d3c2e1f0a"),
		);

		// Then: 操作名と BookId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "ReturnLoanUseCase.run",
			bookId: "0e7a6f3c-2b1d-4c8e-9a5f-6b4d3c2e1f0a",
		});
	});

	test("正常系: name が BookNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と BookId でエラーを作ると
		const error = new BookNotFoundError(
			"ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
			createDummyLoanNumber("LIB-42"),
			{ cause },
		);

		// Then: 操作名と LoanNumber が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
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
			"ReturnLoanUseCase.run",
			createDummyBookId("0e7a6f3c-2b1d-4c8e-9a5f-6b4d3c2e1f0a"),
			{ cause },
		);

		// Then: 操作名と BookId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "ReturnLoanUseCase.run",
			bookId: "0e7a6f3c-2b1d-4c8e-9a5f-6b4d3c2e1f0a",
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
			"ReturnLoanUseCase.run",
			createDummyBookId(),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("BookNotShelvableError");
	});
});
