type Deps = Readonly<{ tableName: string }>;

function createFooRepositoryImpl(deps: Deps): Readonly<{ name: string }> {
	return { name: deps.tableName };
}

export default createFooRepositoryImpl;
