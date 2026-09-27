import { z } from 'zod'
import { InvalidCreationParamError, InvalidReconstructParamError } from '../errors'

// ===== スキーマ =====

/**
 * BookCondition
 * 蔵書の傷み具合。貸し出せるかの判断に使う。
 */
export const BookConditionSchema = z.enum(['good', 'worn', 'damaged'], {
  error: '傷み具合は good・worn・damaged のどれかです'
})

export type BookCondition = z.output<typeof BookConditionSchema>

// ===== 生成 =====

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
export function createBookCondition(value: string): BookCondition {
  const result = BookConditionSchema.safeParse(value)
  if (!result.success) {
    throw new InvalidCreationParamError('BookCondition.create', result.error)
  }
  return result.data
}

// ===== 復元 =====

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function reconstructBookCondition(value: string): BookCondition {
  const result = BookConditionSchema.safeParse(value)
  if (!result.success) {
    throw new InvalidReconstructParamError('BookCondition.reconstruct', result.error)
  }
  return result.data
}
