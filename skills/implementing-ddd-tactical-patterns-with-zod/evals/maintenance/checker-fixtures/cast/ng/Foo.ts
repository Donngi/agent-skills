type Qty = number & { readonly __brand: "Qty" };

export function add(a: number, b: number): Qty {
	return <Qty>(a + b);
}
