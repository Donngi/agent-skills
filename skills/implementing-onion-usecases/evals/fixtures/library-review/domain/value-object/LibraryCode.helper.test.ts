import { LibraryCode } from "./LibraryCode";

export function createDummyLibraryCode(value = "LIB"): LibraryCode {
	return LibraryCode.reconstruct(value);
}
