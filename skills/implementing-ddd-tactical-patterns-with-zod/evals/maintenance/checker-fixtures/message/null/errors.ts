const MESSAGE = "値が不正です";

export abstract class DomainError extends Error {}

export class FooError extends DomainError {
	constructor(id: string) {
		super(`${id}: ${MESSAGE}`);
	}
}
