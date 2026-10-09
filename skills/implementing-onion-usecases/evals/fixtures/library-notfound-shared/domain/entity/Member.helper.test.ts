import { Member, type MemberSchemaInput } from "./Member";

export function createDummyMember(
	params: Partial<MemberSchemaInput> = {},
): Member {
	return Member.reconstruct({
		id: "M-0001",
		name: "ダミーの氏名",
		withdrawn: false,
		...params,
	});
}
