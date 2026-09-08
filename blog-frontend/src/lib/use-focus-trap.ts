import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 弹窗焦点圈禁：打开时保存触发元素并聚焦容器内首个可聚焦元素，
 * Tab/Shift+Tab 在容器内循环，不会逃逸到背景页面；关闭时还原焦点到触发元素。
 * 返回的 ref 挂在弹窗根节点上。
 */
export function useFocusTrap<T extends HTMLElement>(isOpen: boolean) {
  const containerRef = useRef<T | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const container = containerRef.current
    if (!container) return
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const getFocusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    // 打开后聚焦首个可聚焦元素（搜索弹窗自身会再聚焦输入框，此兜底保证抽屉等场景可用）
    const raf = requestAnimationFrame(() => getFocusables()[0]?.focus())

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = getFocusables()
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      // 弹窗关闭或组件卸载时还原焦点到触发按钮；触发元素可能已随路由卸载
      if (restoreRef.current?.isConnected) restoreRef.current.focus()
    }
  }, [isOpen])

  return containerRef
}

/** 弹窗打开期间锁定 body 滚动，关闭后恢复原值 */
export function useScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])
}