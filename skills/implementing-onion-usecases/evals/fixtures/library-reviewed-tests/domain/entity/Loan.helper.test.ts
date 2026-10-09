import { Loan, type LoanSchemaInput } from "./Loan";

type ReservedLoanSchemaInput = Extract<LoanSchemaInput, { status: "reserved" }>;

type LentLoanSchemaInput = Extract<LoanSchemaInput, { status: "lent" }>;

type ReturnedLoanSchemaInput = Extract<LoanSchemaInput, { status: "returned" }>;

// memo は既定で持たない。持たせるときは params で渡す

export function createDummyReservedLoan(
	params: Partial<Omit<ReservedLoanSchemaInput, "status">> = {},
): Loan {
	return Loan.reconstruct({
		id: "LIB-1",
		bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
		memberId: "M-0001",
		holdUntil: 5_000,
		...params,
		status: "reserved",
	});
}

export function createDummyLentLoan(
	params: Partial<Omit<LentLoanSchemaInput, "status">> = {},
): Loan {
	return Loan.reconstruct({
		id: "LIB-1",
		bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
		memberId: "M-0001",
		lentAt: 2_000,
		dueAt: 9_000,
		...params,
		status: "lent",
	});
}

export function createDummyReturnedLoan(
	params: Partial<Omit<ReturnedLoanSchemaInput, "status">> = {},
): Loan {
	return Loan.reconstruct({
		id: "LIB-1",
		bookId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
		memberId: "M-0001",
		lentAt: 2_000,
		dueAt: 9_000,
		returnedAt: 3_000,
		...params,
		status: "returned",
	});
}
