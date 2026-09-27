import { z } from 'zod'
import { InvalidCreationParamError, InvalidReconstructParamError } from '../errors'

// ===== スキーマ =====

declare const BookBarcodeBrand: unique symbol

/**
 * BookBarcode
 * 蔵書1冊ごとに貼るバーコードの番号。
 */
export const BookBarcodeSchema = z
  .string()
  .regex(/^B[0-9]{10}$/, { error: 'バーコードは B と数字10桁です' })
  .brand<typeof BookBarcodeBrand>()

export type BookBarcode = z.output<typeof BookBarcodeSchema>

// ===== 生成 =====

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
export function createBookBarcode(value: string): BookBarcode {
  const result = BookBarcodeSchema.safeParse(value)
  if (!result.success) {
    throw new InvalidCreationParamError('BookBarcode.create', result.error)
  }
  return result.data
}

// ===== 復元 =====

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function reconstructBookBarcode(value: string): BookBarcode {
  const result = BookBarcodeSchema.safeParse(value)
  if (!result.success) {
    throw new InvalidReconstructParamError('BookBarcode.reconstruct', result.error)
  }
  return result.data
}
