import type { LibraryCode } from "../value-object/LibraryCode";
import type { LoanNumber } from "../value-object/LoanNumber";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * LoanNumberIssuer
 * 館ごとに1から始まる連番を、重複なく採番する。
 * 欠番を許す。採番した番号は、貸出を保存しなくても再利用しない。
 */
export type LoanNumberIssuer = Readonly<{
	next: (libraryCode: LibraryCode) => Promise<LoanNumber>;
}>;
