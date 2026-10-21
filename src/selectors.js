// Splits a selector list on top-level commas only. Commas inside parentheses
// (e.g. `a:not(.x, .y)`), attribute brackets, quoted strings or escaped with a
// backslash are left alone.
export function splitSelectors(input) {
  const selectors = []
  let current = ''
  let depth = 0
  let quote = null

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (char === '\\' && i + 1 < input.length) {
      current += char + input[++i]
      continue
    }

    if (quote) {
      if (char === quote) quote = null
      current += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(' || char === '[') {
      depth++
    } else if ((char === ')' || char === ']') && depth > 0) {
      depth--
    } else if (char === ',' && depth === 0) {
      selectors.push(current)
      current = ''
      continue
    }

    current += char
  }

  selectors.push(current)

  return [...new Set(selectors.map(s => s.trim()).filter(Boolean))]
}
