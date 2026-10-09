import { Estimate, type EstimateSchemaInput } from "./Estimate";

export function createDummyEstimate(
	params: Partial<EstimateSchemaInput> = {},
): Estimate {
	return Estimate.reconstruct({
		amount: 3,
		unit: "point",
		...params,
	});
}
