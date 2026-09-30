import {
  Activity,
  BookOpen,
  Bookmark,
  Bot,
  Briefcase,
  Cloud,
  Code,
  Coffee,
  Compass,
  Cpu,
  Database,
  FileText,
  Film,
  Flame,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Key,
  Layers,
  Music,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { dynamicIconImports, type IconName } from 'lucide-react/dynamic'

/**
 * The icons a link can carry, keyed by the value that is stored — a lucide export name (`FileText`),
 * not the kebab-case name of the library's files, because the public site resolves the same stored
 * value against its own lucide import: the spelling is a contract between the two surfaces.
 *
 * They are imported one by one on purpose. The picker and the row renderer used to answer from
 * lucide's full `icons` map, and because that map is one module the whole set — 1,756 components,
 * 507 KiB measured — stayed in a chunk the shell loads at boot; splitting the hub out of the blog
 * barrel did not help, since a statically reached `icons` object cannot be tree-shaken away from the
 * chunks that import single icons (ENG-11). The preset set is what both surfaces draw without help;
 * anything else is resolved to its own module by `lucideSlugOf` and loaded on demand.
 */
export const PRESET_LINK_ICONS: Readonly<Record<string, LucideIcon>> = {
  Globe, Bookmark, Star, Sparkles, Compass, Code, Terminal,
  Bot, Cpu, Layers, BookOpen, Film, Music, Gamepad2,
  ShoppingCart, Briefcase, Heart, Coffee, Zap, Flame,
  Search, Cloud, Database, Share2, Folder, Settings,
  Shield, Wrench, Key, FileText, Send, Activity,
}

export const PRESET_LINK_ICON_NAMES: readonly string[] = Object.keys(PRESET_LINK_ICONS)

/**
 * `lucide-react/dynamic` ships a table of one thunk per icon — the modules themselves, not their
 * components — which is what makes a per-icon load possible without a registry. Its keys are the
 * kebab-case file names; the stored value is the export name, so the two spellings are mapped here,
 * derived from the table's own keys rather than hand-written so a lucide update cannot leave the
 * picker offering a name the renderer cannot load.
 */
function storedNameOf(slug: string): string {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

const slugByStoredName = new Map<string, IconName>()
for (const slug of Object.keys(dynamicIconImports) as IconName[]) {
  const name = storedNameOf(slug)
  // The table carries aliases (`alarm-check` → `alarm-clock-check`); the first wins, and both load
  // the same icon module anyway.
  if (!slugByStoredName.has(name)) slugByStoredName.set(name, slug)
}

/** Every lucide icon the picker can offer, in the stored spelling, sorted for a stable grid. */
export const LUCIDE_LINK_ICON_NAMES: readonly string[] = [...slugByStoredName.keys()].sort()

/** The loader key for a stored icon value, or null when the value is not a lucide icon at all. */
export function lucideSlugOf(storedName: string): IconName | null {
  return slugByStoredName.get(storedName) ?? null
}
