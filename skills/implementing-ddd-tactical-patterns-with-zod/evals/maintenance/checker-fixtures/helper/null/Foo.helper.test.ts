import { Foo } from "./Foo";

export function createDummyFoo() {
	return Foo.reconstruct("foo");
}
