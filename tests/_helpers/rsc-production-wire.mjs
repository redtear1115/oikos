/**
 * Encodes values with React's **production** Flight serializer — the exact
 * module a Vercel deployment runs when it replies to a server action.
 *
 * It has to be a separate process because that module refuses to load unless
 * Node resolves `react` under the `react-server` export condition, and vitest's
 * worker does not (it would swap React out from under every component test).
 * So the caller spawns:
 *
 *   node --conditions=react-server tests/_helpers/rsc-production-wire.mjs
 *
 * stdin  — JSON array of directives:
 *            { "kind": "value", "value": <anything JSON-ish> }
 *            { "kind": "throw", "message": "<Error message>" }
 * stdout — JSON array of the raw Flight payload strings, in the same order.
 *
 * Decoding happens back in the test process with the production *client*
 * module, which has no such condition requirement.
 */
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../package.json', import.meta.url))
const Server = require(
  'next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.production.js',
)

async function readAll(stream) {
  let raw = ''
  stream.setEncoding('utf8')
  for await (const chunk of stream) raw += chunk
  return raw
}

async function streamToText(stream) {
  const decoder = new TextDecoder()
  let out = ''
  for await (const chunk of stream) out += decoder.decode(chunk, { stream: true })
  return out + decoder.decode()
}

const directives = JSON.parse(await readAll(process.stdin))
const payloads = []

for (const directive of directives) {
  const model =
    directive.kind === 'throw'
      ? Promise.reject(new Error(directive.message))
      : directive.value
  // `onError` stands in for Next's own handler, which returns the digest that
  // replaces the message. Returning a fixed string keeps the payload stable.
  const stream = Server.renderToReadableStream(model, {}, { onError: () => 'test-digest' })
  payloads.push(await streamToText(stream))
}

process.stdout.write(JSON.stringify(payloads))
