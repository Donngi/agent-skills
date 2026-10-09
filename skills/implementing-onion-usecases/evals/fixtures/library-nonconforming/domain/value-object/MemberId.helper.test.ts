import { MemberId } from "./MemberId";

export function createDummyMemberId(value = "M-0001"): MemberId {
	return MemberId.reconstruct(value);
}
