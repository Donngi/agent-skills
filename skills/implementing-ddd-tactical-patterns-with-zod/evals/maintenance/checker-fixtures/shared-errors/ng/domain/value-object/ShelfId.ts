import { z } from "zod";

declare const ShelfIdBrand: unique symbol;

/** 棚の識別子。 */
export const ShelfIdSchema = z.uuid().brand<typeof ShelfIdBrand>();

export type ShelfId = z.output<typeof ShelfIdSchema>;
