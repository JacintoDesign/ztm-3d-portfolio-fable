import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // R3F's scene graph is a live tree of three.js objects and animation IS
    // mutation of it. React Compiler's immutability rule forbids exactly what
    // CLAUDE.md's frame-loop discipline requires. Scoped to the scene-graph
    // files only — do not widen it, and do not satisfy it by allocating.
    files: ['components/world/**', 'components/player/**', 'lib/textures/**'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
