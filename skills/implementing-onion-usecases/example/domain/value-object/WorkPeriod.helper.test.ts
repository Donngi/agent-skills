import { WorkPeriod, type WorkPeriodSchemaInput } from "./WorkPeriod";

export function createDummyWorkPeriod(
	params: Partial<WorkPeriodSchemaInput> = {},
): WorkPeriod {
	return WorkPeriod.reconstruct({
		startedAt: 2_000,
		completedAt: 3_000,
		...params,
	});
}
