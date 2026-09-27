import { z } from "zod";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

export const FooDTOSchema = z.strictObject({
	PK: z.string(),
	name: z.string(),
});

export type FooDTO = z.output<typeof FooDTOSchema>;
