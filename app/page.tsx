import { loadContent } from '@/lib/content.server'
import { App } from '@/components/ui/App'

// CONTENT.md is read here, at build time, and handed to the world as data.
export default function Page() {
  return <App content={loadContent()} />
}
