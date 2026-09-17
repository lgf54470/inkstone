import { afterEach, describe, expect, it } from 'vitest'
import { pickImageFile } from './pick-image'

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('the picker did not ask for a file')
  return input
}

function attachFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
}

afterEach(() => {
  document.querySelectorAll('input[type="file"]').forEach((input) => input.remove())
})

describe('pickImageFile', () => {
  it('asks for an image and hands back the file that was chosen', async () => {
    const chosen = new File(['x'], 'photo.png', { type: 'image/png' })
    const pending = pickImageFile()
    const input = fileInput()
    expect(input.accept).toBe('image/*')

    attachFiles(input, [chosen])
    input.dispatchEvent(new Event('change'))

    await expect(pending).resolves.toBe(chosen)
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('answers null when the dialog was dismissed', async () => {
    const pending = pickImageFile()
    fileInput().dispatchEvent(new Event('cancel'))

    await expect(pending).resolves.toBeNull()
  })

  it('treats returning focus with no file as a dismissal, the only signal Safari gives', async () => {
    const pending = pickImageFile()
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    await expect(pending).resolves.toBeNull()
  })

  it('leaves no dangling input behind after the choice', async () => {
    const pending = pickImageFile()
    const input = fileInput()
    attachFiles(input, [new File(['x'], 'photo.png', { type: 'image/png' })])
    input.dispatchEvent(new Event('change'))
    await pending

    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0)
  })
})
