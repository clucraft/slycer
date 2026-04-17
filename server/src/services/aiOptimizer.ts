import axios from 'axios'
import type { MeshAnalysis } from './meshAnalyzer.js'
import { getBaseline, type Priority } from './baselines.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:35b'

interface OptimizeRequest {
  meshAnalysis: MeshAnalysis
  printer: string
  nozzle: number
  material: string
  slicer: string
  priority: Priority
}

export interface PrintSettings {
  [key: string]: string | number
}

export async function generateSettings(request: OptimizeRequest): Promise<PrintSettings> {
  const prompt = buildPrompt(request)

  console.log(`Calling Ollama at ${OLLAMA_URL} with model ${OLLAMA_MODEL}...`)

  const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt: `/no_think\n${prompt}`,
    stream: false,
    format: 'json',
    options: {
      temperature: 0.3,
      num_predict: 4096,
    },
  }, {
    timeout: 300000, // 5 min timeout for slow inference
  })

  // Qwen3.5 returns "thinking" and "response" as separate fields
  const rawText: string = response.data.response || ''
  const thinkingText: string = response.data.thinking || ''
  console.log('Ollama response length:', rawText.length)
  console.log('Ollama thinking length:', thinkingText.length)
  console.log('Ollama response (first 500 chars):', rawText.substring(0, 500))

  // Use response field first, fall back to thinking field
  const textToParse = rawText.trim() || thinkingText.trim()

  if (!textToParse) {
    throw new Error('Ollama returned an empty response')
  }

  const settings = extractJSON(textToParse)
  return settings
}

function extractJSON(text: string): PrintSettings {
  // Try direct parse first
  try {
    return JSON.parse(text) as PrintSettings
  } catch {
    // Continue to extraction attempts
  }

  // Strip thinking tags (Qwen3.5 may wrap output in <think>...</think>)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Strip markdown code fences
  cleaned = cleaned.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()

  // Try parsing cleaned text
  try {
    return JSON.parse(cleaned) as PrintSettings
  } catch {
    // Continue to brace extraction
  }

  // Extract first JSON object by finding matching braces
  const start = cleaned.indexOf('{')
  if (start !== -1) {
    let depth = 0
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++
      else if (cleaned[i] === '}') depth--
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.substring(start, i + 1)) as PrintSettings
        } catch {
          break
        }
      }
    }
  }

  throw new Error(`Failed to parse JSON from Ollama response: ${text.substring(0, 200)}...`)
}

function buildPrompt(req: OptimizeRequest): string {
  const baseline = getBaseline(req.priority, req.nozzle, req.material)
  const priorityGuidance = getPriorityGuidance(req.priority)

  return `You are an expert 3D printing engineer. The user has selected a priority and provided a model. Your job is to TUNE the proven baseline settings below based on the detected geometry — NOT to invent settings from scratch.

## User Priority: ${req.priority.toUpperCase()}
${priorityGuidance}

## Baseline Settings (from Bambu Lab's official ${req.priority} profile for ${req.material.toUpperCase()})
These are the known-good starting values. Only adjust them where the geometry warrants it.

\`\`\`json
${JSON.stringify(baseline, null, 2)}
\`\`\`

## Mesh Analysis
- Triangle count: ${req.meshAnalysis.triangleCount}
- Volume: ${req.meshAnalysis.volume.toFixed(2)} cm³
- Surface area: ${req.meshAnalysis.surfaceArea.toFixed(2)} cm²
- Bounding box: ${req.meshAnalysis.boundingBox.x}mm x ${req.meshAnalysis.boundingBox.y}mm x ${req.meshAnalysis.boundingBox.z}mm
- Max overhang angle: ${req.meshAnalysis.maxOverhangAngle}°
- Thin wall sections: ${req.meshAnalysis.thinWallCount}
- Has bridging: ${req.meshAnalysis.hasBridging}

## User Configuration
- Printer: ${req.printer}
- Nozzle: ${req.nozzle}mm
- Material: ${req.material}
- Slicer: ${req.slicer}

## Geometry-Based Adjustment Rules
- If max overhang > 45°: set support_enabled = true, adjust support_angle accordingly
- If max overhang > 60°: use tree(auto) supports
- If thin walls detected (>10): increase wall_count by 1-2 to reinforce
- If bridging detected: reduce outer_wall_speed by 20-30%, increase cooling
- If bounding box is tall (Z > 100mm): reduce acceleration, ensure stable first layer
- If small part (volume < 5cm³): reduce first_layer_speed further, increase cooling
- If large part (volume > 500cm³): can push speeds up if priority allows

## Output Format
Return ONLY a JSON object with these EXACT keys. Start from the baseline and modify values based on the geometry rules above.

Required keys:
- layer_height (mm)
- first_layer_height (mm)
- wall_count (integer)
- top_layers (integer)
- bottom_layers (integer)
- infill_density (percentage, integer 0-100)
- infill_pattern (string: grid, cubic, gyroid, honeycomb, lightning, triangles)
- print_speed (mm/s)
- outer_wall_speed (mm/s)
- inner_wall_speed (mm/s)
- infill_speed (mm/s)
- travel_speed (mm/s)
- first_layer_speed (mm/s)
- nozzle_temp (°C)
- bed_temp (°C)
- cooling_fan_speed (percentage 0-100)
- support_enabled (boolean)
- support_type (string: "tree(auto)" or "normal(auto)")
- support_angle (degrees)
- retraction_distance (mm)
- retraction_speed (mm/s)
- z_hop (mm)
- notes (string: explain which settings you changed from the baseline and why)

Respond with ONLY the JSON object, no additional text.`
}

function getPriorityGuidance(priority: Priority): string {
  switch (priority) {
    case 'quality':
      return `The user wants maximum surface quality and fine detail. Prioritize:
- Finer layer heights (20-30% of nozzle diameter)
- Slower outer wall speeds (60-80 mm/s) for smooth surfaces
- More top layers for solid top surfaces
- Accept longer print times in exchange for better finish
- Conservative speeds and accelerations`

    case 'strength':
      return `The user wants maximum mechanical strength. Prioritize:
- More wall perimeters (4-6 walls) for thicker shells
- Higher infill density (25-40%)
- Strong infill patterns: grid, cubic, honeycomb (avoid gyroid for Z-strength)
- Higher infill overlap with walls
- Standard layer heights (strength doesn't need fine layers)`

    case 'speed':
      return `The user wants minimum print time. Prioritize:
- Larger layer heights (60-70% of nozzle diameter)
- Higher speeds across all moves
- Lightning infill pattern (fastest)
- Fewer walls (2), fewer top/bottom layers
- Lower infill density (10%)
- Higher acceleration`

    case 'balanced':
      return `The user wants a balance of quality, strength, and speed. Use Bambu's Standard profile as the baseline and only adjust for geometry-specific needs.`

    default:
      return ''
  }
}
