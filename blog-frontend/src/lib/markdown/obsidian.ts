export function stripObsidianComments(source: string): string {
  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? []
  let inComment = false
  let fenceChar = ''
  let fenceLength = 0
  return lines
    .map((line) => {
      const ending = /\r\n$|[\r\n]$/.exec(line)?.[0] ?? ''
      const body = ending ? line.slice(0, -ending.length) : line
      const fence = !inComment ? /^ {0,3}(`{3,}|~{3,})/.exec(body) : null
      if (fence) {
        const marker = fence[1]!
        if (!fenceChar) {
          fenceChar = marker[0]!
          fenceLength = marker.length
        } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
          fenceChar = ''
          fenceLength = 0
        }
        return line
      }
      if (fenceChar) return line
      let output = ''
      let inlineTicks = 0
      for (let index = 0; index < body.length; ) {
        if (body[index] === '`' && !inComment) {
          let end = index + 1
          while (body[end] === '`') end++
          const ticks = end - index
          if (!inlineTicks || inlineTicks === ticks) inlineTicks = inlineTicks ? 0 : ticks
          output += body.slice(index, end)
          index = end
          continue
        }
        const marker = body.startsWith('%%', index) && body[index - 1] !== '\\'
        if (marker && !inlineTicks) {
          inComment = !inComment
          output += '  '
          index += 2
          continue
        }
        output += inComment ? ' ' : body[index]!
        index++
      }
      return output + ending
    })
    .join('')
}