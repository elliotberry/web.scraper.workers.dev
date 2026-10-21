import { describe, it, expect } from 'vitest'
import { splitSelectors } from '../src/selectors.js'

describe('splitSelectors', () => {
  it('splits on top-level commas and trims', () => {
    expect(splitSelectors('h1, .a ,#b')).toEqual(['h1', '.a', '#b'])
  })

  it('ignores commas inside parentheses, brackets and quotes', () => {
    expect(splitSelectors('a:not(.x, .y), p')).toEqual(['a:not(.x, .y)', 'p'])
    expect(splitSelectors('a[title="x,y"], b[data-a=\'1,2\']')).toEqual(['a[title="x,y"]', 'b[data-a=\'1,2\']'])
  })

  it('ignores escaped commas', () => {
    expect(splitSelectors('.a\\,b, .c')).toEqual(['.a\\,b', '.c'])
  })

  it('removes empty and duplicate selectors', () => {
    expect(splitSelectors(' , h1,h1,, ')).toEqual(['h1'])
  })
})
