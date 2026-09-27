import type * as z from 'zod'

// ===== 基底 class =====

/** ドメイン層が投げるエラーの基底 class。 */
export abstract class DomainError extends Error {
  abstract override readonly name: string

  /** どの操作で失敗したか。`'BookCondition.create'` のようにモデル名を含める。 */
  readonly operation: string

  constructor(operation: string, message: string, options?: ErrorOptions) {
    super(`${operation}: ${message}`, options)
    this.operation = operation
  }
}

// ===== エラー =====

/** `create` に渡された値が不正。呼び出し側が入力を直せる。 */
export class InvalidCreationParamError extends DomainError {
  override readonly name: string = 'InvalidCreationParamError'

  readonly issues: readonly z.core.$ZodIssue[]

  constructor(operation: string, cause: z.ZodError) {
    super(operation, '生成に渡された値が不正です', { cause })
    this.issues = cause.issues
  }
}

/** 復元対象の保存値が不正。呼び出し側には直せない。 */
export class InvalidReconstructParamError extends DomainError {
  override readonly name: string = 'InvalidReconstructParamError'

  readonly issues: readonly z.core.$ZodIssue[]

  constructor(operation: string, cause: z.ZodError) {
    super(operation, '復元に渡された値が不正です', { cause })
    this.issues = cause.issues
  }
}

// ===== 到達しないはずの分岐 =====

/** 絶対に通らないはずだが、型の都合で書かざるを得ない分岐に入った。 */
export class FatalUnreachableError extends Error {
  override readonly name: string = 'FatalUnreachableError'

  readonly operation: string

  constructor(operation: string, cause?: unknown) {
    super(
      `${operation}: 到達しないはずの分岐に入りました`,
      cause === undefined ? undefined : { cause }
    )
    this.operation = operation
  }
}
