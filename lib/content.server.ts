import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Channel, Content, CoursePanel, Panel, Project } from './content'

const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/`/g, '').trim()

/** `**Name:** value`, where the value may wrap across lines. */
function field(block: string, name: string): string {
  const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n\\s*-\\s+\\*\\*|\\n\\*\\*|$)`))
  return m ? flat(m[1]) : ''
}
const section = (doc: string, title: string) => {
  const m = doc.match(new RegExp(`(?:^|\\n)## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`))
  return m ? m[1] : ''
}
const subsections = (block: string) =>
  [...block.matchAll(/(?:^|\n)### (.+)\n([\s\S]*?)(?=\n### |\n---|$)/g)].map((m) => ({ title: m[1].trim(), body: m[2] }))
const list = (s: string, sep: RegExp) => s.split(sep).map((v) => v.trim()).filter(Boolean)

/** CONTENT.md is the only source of project, about and contact material. Read at build time. */
export function loadContent(): Content {
  const doc = readFileSync(join(process.cwd(), 'CONTENT.md'), 'utf8')

  const intro = section(doc, 'Intro')
  const stats = [...intro.matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)].map((m) => ({ value: m[1], label: m[2].trim() }))
  const panels: Panel[] = subsections(section(doc, 'Story Panels')).map((s) => {
    const [number, ...rest] = s.title.split(' — ')
    return { number: number.trim(), title: rest.join(' — ').trim(), body: flat(s.body) }
  })
  const course = (title: string): CoursePanel | null => {
    const b = section(doc, title)
    if (!b) return null
    return { label: field(b, 'Label'), title: field(b, 'Title'), blurb: field(b, 'Blurb'), url: field(b, 'URL'), linkLabel: field(b, 'Link label') }
  }

  const projects: Project[] = subsections(section(doc, 'Projects')).map((s, i) => {
    const name = s.title.replace(/^\d+\s*—\s*/, '').trim()
    return {
      index: i,
      name,
      description: field(s.body, 'Description'),
      tags: list(field(s.body, 'Tags'), /·/),
      tech: list(field(s.body, 'Tech'), /,/),
      url: field(s.body, 'URL'),
      github: field(s.body, 'GitHub'),
      screenshot: field(s.body, 'Screenshot'),
    }
  })

  const contact = section(doc, 'Contact')
  const channels: Channel[] = [...contact.matchAll(/^- \*\*(.+?)\*\* — (.+?) — (\S+)\s*$/gm)].map((m) => ({ name: m[1], handle: m[2].trim(), url: m[3] }))

  return {
    about: {
      eyebrow: field(intro, 'Eyebrow'),
      heading: field(intro, 'Heading'),
      role: field(intro, 'Role'),
      tagline: field(intro, 'Tagline'),
      location: field(intro, 'Location'),
      stats,
      panels,
      courses: [course('Now Panel'), course('Foundational Course Panel')].filter((c): c is CoursePanel => !!c),
    },
    projects,
    contact: { heading: field(contact, 'Heading'), supporting: field(contact, 'Supporting'), location: field(contact, 'Location'), channels },
  }
}
