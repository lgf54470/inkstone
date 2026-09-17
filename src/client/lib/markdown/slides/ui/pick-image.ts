export const IMAGE_ACCEPT = 'image/*'

/**
 * Asks the browser for one picture. The input is created for the duration of the dialog
 * rather than kept in the markup because the only thing that opens it is a toolbar button —
 * and it is removed on every path, including the one where nobody picked anything, because
 * a detached input left in the body would still hold the file's bytes alive.
 */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMAGE_ACCEPT
    input.hidden = true

    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      resolve(file)
    }
    // Safari has no `cancel` event on a file input: the dialog closing hands focus back to
    // the window with no change, and that is the only signal that nothing was picked.
    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null)
      }, 0)
    }

    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => finish(null))
    window.addEventListener('focus', onWindowFocus)
    document.body.append(input)
    input.click()
  })
}
