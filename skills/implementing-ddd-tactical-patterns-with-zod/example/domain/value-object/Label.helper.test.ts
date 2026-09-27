import { Label } from "./Label";

export function createDummyLabel(value = "bug"): Label {
	return Label.reconstruct(value);
}
