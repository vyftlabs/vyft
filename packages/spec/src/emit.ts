import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { stringify } from "yaml"
import { document } from "./document.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, "../dist")
const outFile = resolve(outDir, "openapi.yaml")

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, stringify(document, { lineWidth: 0 }), "utf8")

const pathCount = Object.keys(document.paths ?? {}).length
const componentCount = Object.keys(document.components?.schemas ?? {}).length

console.log(`emitted: ${outFile}`)
console.log(`  paths: ${pathCount}`)
console.log(`  schemas: ${componentCount}`)
