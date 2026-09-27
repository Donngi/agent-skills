export function createFooRepository(
	deps: Readonly<{ tableName: string }>,
): Readonly<{
	name: string;
}> {
	return { name: deps.tableName };
}
