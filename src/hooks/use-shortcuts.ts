'use client'

import * as React from 'react'

/**
 * Hook that detects when the user pastes a Scribd URL anywhere on the page
 * and calls the callback with the pasted text.
 */
export function useClipboardPaste(onPaste: (text: string) => void) {
  React.useEffect(() => {
    function handler(e: ClipboardEvent) {
      const text = e.clipboardData?.getData('text') || ''
      if (text && text.includes('scribd.com')) {
        e.preventDefault()
        onPaste(text.trim())
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [onPaste])
}

/**
 * Hook for registering keyboard shortcuts.
 * Pass a map of key combos (e.g. "mod+k") to handlers.
 * "mod" maps to Cmd on Mac, Ctrl elsewhere.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  enabled = true
) {
  React.useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
      const mod = isMac ? e.metaKey : e.ctrlKey

      for (const [combo, cb] of Object.entries(shortcuts)) {
        const parts = combo.toLowerCase().split('+')
        const needsMod = parts.includes('mod')
        const needsShift = parts.includes('shift')
        const needsAlt = parts.includes('alt')
        const key = parts[parts.length - 1]

        if (
          (needsMod ? mod : !mod || true) &&
          (needsShift ? e.shiftKey : true) &&
          (needsAlt ? e.altKey : true) &&
          e.key.toLowerCase() === key
        ) {
          // Only trigger if mod requirement is exactly met
          if (needsMod === mod && needsShift === e.shiftKey && needsAlt === e.altKey) {
            // Avoid triggering when typing in inputs for non-mod shortcuts
            const target = e.target as HTMLElement
            const isTyping =
              target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.isContentEditable
            if (!needsMod && isTyping) continue

            e.preventDefault()
            cb()
            return
          }
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [shortcuts, enabled])
}
