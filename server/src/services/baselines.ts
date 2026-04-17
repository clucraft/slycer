// Baseline print settings derived from Bambu Lab's official profile recommendations.
// These serve as proven starting points that the AI adjusts based on model geometry.

export type Priority = 'quality' | 'strength' | 'speed' | 'balanced'

export interface Baseline {
  layer_height: number
  first_layer_height: number
  wall_count: number
  top_layers: number
  bottom_layers: number
  infill_density: number
  infill_pattern: string
  print_speed: number
  outer_wall_speed: number
  inner_wall_speed: number
  infill_speed: number
  travel_speed: number
  first_layer_speed: number
  cooling_fan_speed: number
}

// Material-specific temperature and cooling defaults (from Bambu's Generic profiles)
interface MaterialDefaults {
  nozzle_temp: number
  bed_temp: number
  fan_speed: number
  max_fan_speed: number
  retraction_distance: number
}

const MATERIALS: Record<string, MaterialDefaults> = {
  pla: { nozzle_temp: 220, bed_temp: 55, fan_speed: 100, max_fan_speed: 100, retraction_distance: 0.8 },
  'pla+': { nozzle_temp: 220, bed_temp: 55, fan_speed: 100, max_fan_speed: 100, retraction_distance: 0.8 },
  petg: { nozzle_temp: 240, bed_temp: 70, fan_speed: 50, max_fan_speed: 80, retraction_distance: 1.0 },
  abs: { nozzle_temp: 260, bed_temp: 90, fan_speed: 0, max_fan_speed: 30, retraction_distance: 0.8 },
  asa: { nozzle_temp: 260, bed_temp: 90, fan_speed: 0, max_fan_speed: 30, retraction_distance: 0.8 },
  tpu: { nozzle_temp: 220, bed_temp: 35, fan_speed: 80, max_fan_speed: 100, retraction_distance: 2.0 },
  nylon: { nozzle_temp: 280, bed_temp: 80, fan_speed: 0, max_fan_speed: 50, retraction_distance: 1.0 },
  pc: { nozzle_temp: 270, bed_temp: 100, fan_speed: 0, max_fan_speed: 30, retraction_distance: 0.8 },
}

// Layer height as a fraction of nozzle diameter.
// Quality: 20-30%, Balanced: 40-50%, Speed: 60-70%
function layerHeightForPriority(priority: Priority, nozzle: number): number {
  const ratios: Record<Priority, number> = {
    quality: 0.30,   // 0.12mm for 0.4 nozzle (High Quality)
    balanced: 0.50,  // 0.20mm for 0.4 nozzle (Standard)
    strength: 0.50,  // 0.20mm (strength doesn't need fine layers)
    speed: 0.70,     // 0.28mm for 0.4 nozzle (Extra Draft)
  }
  return Math.round(nozzle * ratios[priority] * 100) / 100
}

// Priority-based setting modifiers
function baselineForPriority(priority: Priority, nozzle: number, material: string): Baseline {
  const layerHeight = layerHeightForPriority(priority, nozzle)
  const mat = MATERIALS[material.toLowerCase()] || MATERIALS.pla

  // Common defaults
  const base: Baseline = {
    layer_height: layerHeight,
    first_layer_height: Math.max(0.2, layerHeight),
    wall_count: 3,
    top_layers: 5,
    bottom_layers: 4,
    infill_density: 15,
    infill_pattern: 'cubic',
    print_speed: 200,
    outer_wall_speed: 150,
    inner_wall_speed: 200,
    infill_speed: 200,
    travel_speed: 400,
    first_layer_speed: 50,
    cooling_fan_speed: mat.fan_speed,
  }

  // Priority-specific overrides
  switch (priority) {
    case 'quality':
      // Lower speeds, more conservative, better surface
      return {
        ...base,
        wall_count: 3,
        top_layers: 6,
        bottom_layers: 5,
        infill_density: 15,
        infill_pattern: 'gyroid',
        print_speed: 120,
        outer_wall_speed: 60,     // slow outer wall for best finish
        inner_wall_speed: 120,
        infill_speed: 150,
        travel_speed: 300,
        first_layer_speed: 30,
      }

    case 'strength':
      // More walls, higher infill, grid/honeycomb patterns
      return {
        ...base,
        wall_count: 5,
        top_layers: 5,
        bottom_layers: 4,
        infill_density: 30,
        infill_pattern: 'grid',   // stronger than gyroid in Z
        print_speed: 180,
        outer_wall_speed: 120,
        inner_wall_speed: 180,
        infill_speed: 180,
        travel_speed: 400,
        first_layer_speed: 40,
      }

    case 'speed':
      // Max speeds, sparse infill, larger layers
      return {
        ...base,
        wall_count: 2,
        top_layers: 4,
        bottom_layers: 3,
        infill_density: 10,
        infill_pattern: 'lightning', // fastest infill pattern
        print_speed: 300,
        outer_wall_speed: 200,
        inner_wall_speed: 300,
        infill_speed: 300,
        travel_speed: 500,
        first_layer_speed: 60,
      }

    case 'balanced':
    default:
      // Bambu's standard profile defaults
      return {
        ...base,
        wall_count: 3,
        top_layers: 5,
        bottom_layers: 4,
        infill_density: 15,
        infill_pattern: 'cubic',
        print_speed: 200,
        outer_wall_speed: 150,
        inner_wall_speed: 200,
        infill_speed: 200,
        travel_speed: 400,
        first_layer_speed: 50,
      }
  }
}

export interface FullBaseline extends Baseline {
  nozzle_temp: number
  bed_temp: number
  max_fan_speed: number
  retraction_distance: number
  retraction_speed: number
  z_hop: number
  support_angle: number
  support_type: string
}

export function getBaseline(priority: Priority, nozzle: number, material: string): FullBaseline {
  const base = baselineForPriority(priority, nozzle, material)
  const mat = MATERIALS[material.toLowerCase()] || MATERIALS.pla

  return {
    ...base,
    nozzle_temp: mat.nozzle_temp,
    bed_temp: mat.bed_temp,
    cooling_fan_speed: Math.min(base.cooling_fan_speed, mat.max_fan_speed),
    max_fan_speed: mat.max_fan_speed,
    retraction_distance: mat.retraction_distance,
    retraction_speed: 30,
    z_hop: 0.4,
    support_angle: 30,
    support_type: 'tree(auto)',
  }
}
