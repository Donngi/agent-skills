// AWS SDK のコマンドと同じ形。変数に置いた基底の class から継承していて、Error の系列ではない
class SmithyCommand<Input> {
	constructor(readonly input: Input) {}
}

type PutFooInput = { readonly key: string };

const PutFooCommandBase: new (
	input: PutFooInput,
) => SmithyCommand<PutFooInput> = SmithyCommand;

export class PutFooCommand extends PutFooCommandBase {}

export class FooConflictError extends Error {}

export class FooVersionConflictError extends FooConflictError {}

// 型から class を決められない構築子
export const unknownConstructor: new () => object = Object;
