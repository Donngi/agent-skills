import { expect, test } from 'vitest'
import { InvalidCreationParamError, InvalidReconstructParamError } from '../../errors'
import {
  BookConditionSchema,
  createBookCondition,
  reconstructBookCondition
} from '../BookCondition'

test('createBookCondition: 定義した3つの傷み具合を受け入れる', () => {
  expect(createBookCondition('good')).toBe('good')
  expect(createBookCondition('worn')).toBe('worn')
  expect(createBookCondition('damaged')).toBe('damaged')
})

test('createBookCondition: 定義に無い値を拒否する', () => {
  expect(() => createBookCondition('lost')).toThrow(InvalidCreationParamError)
})

test('createBookCondition: 大文字の値を拒否する', () => {
  expect(() => createBookCondition('GOOD')).toThrow(InvalidCreationParamError)
})

test('reconstructBookCondition: 壊れた保存値を復元のエラーで拒否する', () => {
  expect(() => reconstructBookCondition('')).toThrow(InvalidReconstructParamError)
})

test('BookConditionSchema: 定義した値と定義に無い値を見分ける', () => {
  expect(BookConditionSchema.safeParse('worn').success).toBe(true)
  expect(BookConditionSchema.safeParse('lost').success).toBe(false)
  expect(BookConditionSchema.safeParse(1).success).toBe(false)
})
