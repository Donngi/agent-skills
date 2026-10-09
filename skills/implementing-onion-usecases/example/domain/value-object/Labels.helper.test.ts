import { Labels, type LabelsSchemaInput } from "./Labels";

export function createDummyLabels(value: LabelsSchemaInput = []): Labels {
	return Labels.reconstruct(value);
}
