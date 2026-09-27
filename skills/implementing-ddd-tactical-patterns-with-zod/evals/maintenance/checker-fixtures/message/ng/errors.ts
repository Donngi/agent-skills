export abstract class DomainError extends Error {}

export class FooError extends DomainError {
	constructor() {
		super("値を指定してください");
	}
}
