/** Splitting the city between a detailed model that covers part of it and the procedural bands beyond. */
import type { CityBuildingBand, CityConfig } from './types'

/** Clips every band of a city to the slot-local X range [from, to]. */
function clipCity(cfg: CityConfig, from: number, to: number): CityConfig {
  const clip = <B extends CityBuildingBand>(band: B): B => {
    const [lo, hi] = band.span ?? cfg.span
    const a = Math.max(lo, from)
    return { ...band, span: [a, Math.max(a, Math.min(hi, to))] }
  }
  return { ...cfg, skyline: clip(cfg.skyline), midrise: clip(cfg.midrise), industrial: clip(cfg.industrial) }
}

/**
 * Splits a city at `modelEnd`: the part the detailed model replaces (the slot's stand-in) and the part beyond it,
 * drawn procedurally whether or not the model is present. Without `modelEnd` the stand-in is the whole city.
 */
export function splitCity(cfg: CityConfig): { standIn: CityConfig; beyondModel: CityConfig | null } {
  if (cfg.modelEnd === undefined) return { standIn: cfg, beyondModel: null }
  return { standIn: clipCity(cfg, -Infinity, cfg.modelEnd), beyondModel: clipCity(cfg, cfg.modelEnd, Infinity) }
}
