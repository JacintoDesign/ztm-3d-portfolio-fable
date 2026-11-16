// Shapes of what CONTENT.md carries. The parser lives in content.server.ts.
export type Project = {
  index: number
  name: string
  description: string
  tags: string[]
  tech: string[]
  url: string
  github: string
  screenshot: string
}
export type Panel = { number: string; title: string; body: string }
export type CoursePanel = { label: string; title: string; blurb: string; url: string; linkLabel: string }
export type Channel = { name: string; handle: string; url: string }
export type Content = {
  about: {
    eyebrow: string
    heading: string
    role: string
    tagline: string
    location: string
    stats: { value: string; label: string }[]
    panels: Panel[]
    courses: CoursePanel[]
  }
  projects: Project[]
  contact: { heading: string; supporting: string; location: string; channels: Channel[] }
}
