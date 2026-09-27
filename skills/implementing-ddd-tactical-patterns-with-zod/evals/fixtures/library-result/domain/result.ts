/**
 * このプロジェクトのドメイン層は失敗を投げずに返す。
 * 成功と失敗のどちらかを表す型と、その生成関数だけを置く。
 */

export type Ok<T> = Readonly<{ ok: true; value: T }>;

export type Err<E> = Readonly<{ ok: false; error: E }>;

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}
