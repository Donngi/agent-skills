import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import { createDummyUserId } from "../value-object/UserId.helper.test";
import {
	type CreateProjectProps,
	Project,
	type ProjectDeps,
	type ProjectSchemaInput,
} from "./Project";

export function createDummyProject(
	params: Partial<ProjectSchemaInput> = {},
): Project {
	return Project.reconstruct({
		id: "PROJ",
		name: "ダミーのプロジェクト",
		leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		createdAt: 1_000,
		archived: false,
		...params,
	});
}

export function createDummyCreateProjectProps(
	params: Partial<CreateProjectProps> = {},
): CreateProjectProps {
	return {
		id: createDummyProjectId(),
		name: "ダミーのプロジェクト",
		leadId: createDummyUserId(),
		...params,
	};
}

export function createDummyProjectDeps(
	params: Partial<ProjectDeps> = {},
): ProjectDeps {
	return {
		clock: { now: () => 1_000 },
		...params,
	};
}
