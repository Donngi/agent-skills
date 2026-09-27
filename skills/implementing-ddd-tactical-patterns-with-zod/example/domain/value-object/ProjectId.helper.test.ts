import { ProjectId } from "./ProjectId";

export function createDummyProjectId(value = "PROJ"): ProjectId {
	return ProjectId.reconstruct(value);
}
