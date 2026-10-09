// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type Ok<T> = Readonly<{ ok: true; value: T }>;

export type Err<E> = Readonly<{ ok: false; error: E }>;

/**
 * Result
 * ユースケースの成功と失敗のどちらかを表す。
 */
export type Result<T, E> = Ok<T> | Err<E>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}
