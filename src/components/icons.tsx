// Ícones monocromáticos (traço único, herdam a cor do texto via currentColor).
type P = { className?: string }
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function IconClock({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}
export function IconDownload({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
}
export function IconLock({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}
export function IconSearch({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" /></svg>
}
export function IconEdit({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
}
export function IconTrash({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></svg>
}
export function IconCheck({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><path d="M5 13l4 4L19 7" /></svg>
}
export function IconWarn({ className = 'w-4 h-4' }: P) {
  return <svg className={className} viewBox="0 0 24 24" {...base}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v5" /><path d="M12 18h.01" /></svg>
}
