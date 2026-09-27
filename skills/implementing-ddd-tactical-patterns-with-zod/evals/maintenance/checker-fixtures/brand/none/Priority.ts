import { z } from "zod";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

/** 優先度。 */
export const PrioritySchema = z.enum(["low", "high"], {
	error: "優先度は low か high です",
});

export type Priority = z.output<typeof PrioritySchema>;
