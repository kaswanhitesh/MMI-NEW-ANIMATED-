/**
 * ValidatedGLTFLoader — a GLTFLoader that inspects the response bytes BEFORE
 * handing them to the glTF parser.
 *
 * Why this exists: Vite's dev server and most SPA hosts answer a request for a
 * file that does not exist with `index.html` and HTTP 200 (Vite's html
 * fallback rewrites any GET carrying a wildcard Accept header, which is what
 * `fetch()` sends). three's GLTFLoader would then try to parse an HTML page
 * and surface an opaque JSON error. This loader classifies the payload first
 * and reports every failure as a `ModelLoadError` with a stable `code` and a
 * one-line, human-readable message, so the asset layer can substitute the
 * TEMPORARY placeholder geometry without guessing.
 *
 * The override mirrors three's GLTFLoader.load (r186): the same LoadingManager
 * bookkeeping (`itemStart` / `itemEnd` / `itemError`), the same FileLoader
 * configuration (path, request headers, credentials) and the same
 * `resourcePath` resolution used for external .bin and texture references.
 */
import { FileLoader, LoaderUtils } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

/** Failure categories reported by `ValidatedGLTFLoader`. */
export type ModelLoadErrorCode = 'network' | 'not-glb' | 'parse'

/**
 * Error raised for every failed model load.
 *  - `network`: the request failed or returned a non-2xx status (404, 500, offline…).
 *  - `not-glb`: the server answered 200 but the body is not a GLB / glTF (typically an HTML fallback page).
 *  - `parse`:   the bytes looked like glTF but GLTFLoader could not parse them.
 */
export class ModelLoadError extends Error {
  readonly url: string
  readonly code: ModelLoadErrorCode

  constructor(code: ModelLoadErrorCode, url: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ModelLoadError'
    this.code = code
    this.url = url
  }
}

/** "glTF" read as a little-endian uint32: the first four bytes of every binary glTF (GLB) container. */
export const GLB_MAGIC = 0x46546c67
/** Size of the GLB header (magic, version, total length) — the minimum plausible payload. */
const GLB_HEADER_BYTES = 12
/** How far `inspectModelPayload` scans for the first significant byte of a text payload. */
const TEXT_SCAN_LIMIT = 4096

/** What a response body appears to contain. Only `glb` and `gltf-json` are handed to the parser. */
export type ModelPayloadKind = 'glb' | 'gltf-json' | 'html' | 'empty' | 'unknown'

/**
 * Classifies a fetched payload without parsing it. Exported so the detection
 * rules can be exercised with hand-made buffers.
 */
export function inspectModelPayload(data: unknown): ModelPayloadKind {
  if (!(data instanceof ArrayBuffer) || data.byteLength < GLB_HEADER_BYTES) return 'empty'
  if (new DataView(data).getUint32(0, true) === GLB_MAGIC) return 'glb'
  const first = firstSignificantByte(new Uint8Array(data))
  if (first === 0x7b) return 'gltf-json' // '{'
  if (first === 0x3c) return 'html' // '<'
  return 'unknown'
}

/** First byte that is neither a UTF-8 BOM nor ASCII whitespace, or -1 if none is found within the scan limit. */
function firstSignificantByte(bytes: Uint8Array): number {
  let i = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  const end = Math.min(bytes.length, TEXT_SCAN_LIMIT)
  for (; i < end; i++) {
    const b = bytes[i]
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return b
  }
  return -1
}

function describeError(error: unknown): string {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return ''
}

/** Extracts "404 Not Found" from the HttpError three's FileLoader raises for non-2xx responses. */
function httpStatusOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('response' in error)) return null
  const response = error.response
  if (!(response instanceof Response)) return null
  return response.statusText ? `${response.status} ${response.statusText}` : String(response.status)
}

function payloadError(kind: Exclude<ModelPayloadKind, 'glb' | 'gltf-json'>, url: string): ModelLoadError {
  switch (kind) {
    case 'html':
      return new ModelLoadError(
        'not-glb',
        url,
        `Model file "${url}" is missing — the server returned an HTML page instead of a GLB (dev servers and SPA hosts answer missing files with index.html and HTTP 200).`,
      )
    case 'empty':
      return new ModelLoadError('not-glb', url, `Model file "${url}" is empty or truncated (fewer than ${GLB_HEADER_BYTES} bytes).`)
    case 'unknown':
      return new ModelLoadError('not-glb', url, `Model file "${url}" is not a GLB or glTF file (unrecognised header).`)
  }
}

function networkError(error: unknown, url: string): ModelLoadError {
  const status = httpStatusOf(error)
  const detail = status ? `HTTP ${status}` : describeError(error) || 'network request failed'
  return new ModelLoadError('network', url, `Model file "${url}" could not be fetched (${detail}).`, error)
}

function parseError(error: unknown, url: string): ModelLoadError {
  const detail = describeError(error)
  return new ModelLoadError('parse', url, `Model file "${url}" could not be parsed as glTF${detail ? ` — ${detail}` : ''}.`, error)
}

/** Same resolution GLTFLoader.load (r186) performs for the base URL of external .bin / texture references. */
function resolveResourcePath(loader: GLTFLoader, url: string): string {
  if (loader.resourcePath !== '') return loader.resourcePath
  if (loader.path !== '') return LoaderUtils.resolveURL(LoaderUtils.extractUrlBase(url), loader.path)
  return LoaderUtils.extractUrlBase(url)
}

export class ValidatedGLTFLoader extends GLTFLoader {
  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const manager = this.manager
    const resourcePath = resolveResourcePath(this, url)

    // Like GLTFLoader: track one extra item that only ends once parsing has finished,
    // so `manager.onLoad` cannot fire before the model is usable.
    manager.itemStart(url)

    const fail = (error: ModelLoadError): void => {
      if (onError) onError(error)
      else console.error(error)
      manager.itemError(url)
      manager.itemEnd(url)
    }

    const fileLoader = new FileLoader<ArrayBuffer>(manager)
    fileLoader.setPath(this.path)
    fileLoader.setResponseType('arraybuffer')
    fileLoader.setRequestHeader(this.requestHeader)
    fileLoader.setWithCredentials(this.withCredentials)

    const onData = (data: ArrayBuffer): void => {
      const kind = inspectModelPayload(data)
      if (kind !== 'glb' && kind !== 'gltf-json') {
        fail(payloadError(kind, url))
        return
      }
      try {
        this.parse(
          data,
          resourcePath,
          (gltf) => {
            onLoad(gltf)
            manager.itemEnd(url)
          },
          (event) => fail(parseError(event, url)),
        )
      } catch (error) {
        fail(parseError(error, url))
      }
    }

    try {
      fileLoader.load(url, onData, onProgress, (error) => fail(networkError(error, url)))
    } catch (error) {
      // e.g. an unparseable URL throws synchronously from `new Request()`; keep the manager balanced.
      fail(networkError(error, url))
    }
  }
}

/** React Three Fiber's useLoader wraps loader errors as `Could not load <url>: <message>`; this unwraps them. */
const R3F_WRAPPER = /^Could not load \S+: ([\s\S]+)$/

function singleLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, ' ').trim()
}

/**
 * One-line human-readable description of a failed model load, for status
 * overlays and development warnings. Accepts a ModelLoadError, the Error
 * React Three Fiber wraps it in, a plain string, or anything else.
 */
export function getModelLoadErrorMessage(error: unknown): string {
  let message: string
  if (error instanceof ModelLoadError) message = error.message
  else if (error instanceof Error) message = R3F_WRAPPER.exec(error.message)?.[1] ?? error.message
  else message = describeError(error)
  return singleLine(message) || 'Unknown model loading error.'
}

/**
 * Loader configuration hook, passed as the `extensions` argument of
 * `useLoader(ValidatedGLTFLoader, url, configureModelLoader)`. React Three
 * Fiber keeps ONE loader instance per constructor and invokes this before
 * EVERY load, so whatever is added here must be idempotent.
 *
 * Today it is intentionally a no-op: the manifest models are expected as
 * plain, uncompressed GLBs. When compressed deliveries arrive:
 *  - Draco:   `import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'`,
 *             create ONE module-level instance, point it at a copy of
 *             node_modules/three/examples/jsm/libs/draco/gltf/ served from
 *             `${import.meta.env.BASE_URL}draco/`, then
 *             `if (!loader.dracoLoader) loader.setDRACOLoader(draco)`.
 *  - Meshopt: `import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'`,
 *             then `if (!loader.meshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder)`.
 */
export function configureModelLoader(loader: GLTFLoader): void {
  // Intentionally empty — see the comment above for enabling Draco / meshopt.
  void loader
}
