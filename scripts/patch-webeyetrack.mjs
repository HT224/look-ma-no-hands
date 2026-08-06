import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const bundleUrl = new URL('../node_modules/webeyetrack/dist/index.js', import.meta.url)
const bundlePath = fileURLToPath(bundleUrl)
const original = '(i=new o.default).initialize()'
const patched = '(i=new o.default(9)).initialize()'
const bundle = await readFile(bundlePath, 'utf8')

if (bundle.includes(patched)) process.exit(0)
if (!bundle.includes(original)) {
  throw new Error('WebEyeTrack worker constructor changed; review the nine-point calibration patch.')
}

await writeFile(bundlePath, bundle.replace(original, patched))
console.log('Patched WebEyeTrack to retain nine calibration samples.')
