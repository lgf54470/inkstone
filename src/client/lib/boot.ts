
export function dismissBootScreen(): void {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.classList.add('done')
  window.setTimeout(() => boot.remove(), 400)
}

export function renderBootError(container: HTMLElement, onReload: () => void): void {
  container.innerHTML = `
    <div role="alert" class="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[var(--bg-base)] px-6 text-center text-[var(--text-primary)]">
      <p class="text-[length:var(--text-15)] font-semibold">Unable to load application</p>
      <p class="max-w-80 text-[length:var(--text-12\\.5)] leading-relaxed text-[var(--text-tertiary)]">A network or asset error prevented the application from starting.</p>
      <button type="button" id="boot-reload-btn" class="mt-2 h-9 rounded-lg bg-[var(--accent)] px-4 text-[length:var(--text-12\\.5)] font-semibold text-[var(--accent-contrast)] cursor-pointer">Reload</button>
    </div>
  `
  document.getElementById('boot-reload-btn')?.addEventListener('click', onReload)
}

