type Foo = Readonly<{ id: string }>;

export const Foo = {
	create: (id: string): Foo => ({ id }),
	reconstruct: (id: string): Foo => ({ id }),
};
