import { z } from "zod";

/**
 * 品番。倉庫システムを作り始めたころから使っている。
 * 古い伝票は ABC-1 のように連番を詰めずに書いていたので、1〜5桁を受け入れる。
 */
export const SkuSchema = z
	.string()
	.transform((v) => v.trim().toUpperCase())
	.pipe(z.string().regex(/^[A-Z]{3}-[0-9]{1,5}$/))
	.brand<"Sku">();

export type Sku = z.infer<typeof SkuSchema>;

export function createSku(value: string): Sku {
	return SkuSchema.parse(value);
}

export function skuToString(value: Sku): string {
	return value;
}
