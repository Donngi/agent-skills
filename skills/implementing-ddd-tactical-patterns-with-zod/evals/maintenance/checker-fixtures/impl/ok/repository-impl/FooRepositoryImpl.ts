export type FooRepositoryImplDeps = Readonly<{ tableName: string }>;

export function createFooRepositoryImpl(deps: FooRepositoryImplDeps): Readonly<{
	name: string;
}> {
	return { name: deps.tableName };
}
