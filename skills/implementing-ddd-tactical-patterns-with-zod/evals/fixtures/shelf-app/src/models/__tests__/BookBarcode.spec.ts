import { expect, test } from 'vitest'
import { InvalidCreationParamError, InvalidReconstructParamError } from '../../errors'
import { BookBarcodeSchema, createBookBarcode, reconstructBookBarcode } from '../BookBarcode'

test('createBookBarcode: B と数字10桁を受け入れる', () => {
  expect(createBookBarcode('B0000000123')).toBe('B0000000123')
})

test('createBookBarcode: 桁が足りない値を拒否する', () => {
  expect(() => createBookBarcode('B123')).toThrow(InvalidCreationParamError)
})

test('createBookBarcode: 接頭辞が違う値を拒否する', () => {
  expect(() => createBookBarcode('C0000000123')).toThrow(InvalidCreationParamError)
})

test('reconstructBookBarcode: 壊れた保存値を復元のエラーで拒否する', () => {
  expect(() => reconstructBookBarcode('')).toThrow(InvalidReconstructParamError)
})

test('BookBarcodeSchema: 生の値と壊れた値を見分ける', () => {
  expect(BookBarcodeSchema.safeParse('B0000000123').success).toBe(true)
  expect(BookBarcodeSchema.safeParse('B123').success).toBe(false)
  expect(BookBarcodeSchema.safeParse(123).success).toBe(false)
})

test('型: 生の文字列を BookBarcode として渡せない', () => {
  // @ts-expect-error 生の文字列は BookBarcode ではない
  const _barcode: ReturnType<typeof createBookBarcode> = 'B0000000123'
})
