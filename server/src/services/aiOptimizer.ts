import axios from 'axios'
import type { MeshAnalysis } from './meshAnalyzer.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:35b'

interface OptimizeRequest {
  meshAnalysis: MeshAnalysis
  printer: string
  nozzle: number
  material: string
  slicer: string
}

export interface PrintSettings {
  [key: string]: string | number
}

export async function generateSettings(request: OptimizeRequest): Promise<PrintSettings> {
  const prompt = buildPrompt(request)

  console.log(`Calling Ollama at ${OLLAMA_URL} with model ${OLLAMA_MODEL}...`)

  const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    format: 'json',
    options: {
      temperature: 0.3,
      num_predict: 4096,
    },
  }, {
    timeout: 300000, // 5 min timeout for slow inference
  })

  const rawText: string = response.data.response || ''
  console.log('Ollama raw response length:', rawText.length)
  console.log('Ollama raw response (first 500 chars):', rawText.substring(0, 500))

  if (!rawText.trim()) {
    throw new Error('Ollama returned an empty response')
  }

  const settings = extractJSON(rawText)
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
  return `You are an expert 3D printing engineer. Analyze the following mesh data and user configuration, then provide optimized print settings.

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

## Instructions
Provide optimized print settings as a JSON object. Focus on:
1. Clean, professional results with low failure rate
2. Settings appropriate for the detected geometry (overhangs, thin walls, bridging)
3. Material-specific temperatures and cooling
4. Printer-specific speed limits and capabilities
5. Slicer-compatible parameter names for ${req.slicer}

Return ONLY a JSON object with these keys (use slicer-appropriate parameter names):
- layer_height (mm)
- first_layer_height (mm)
- wall_count (integer)
- top_layers (integer)
- bottom_layers (integer)
- infill_density (percentage)
- infill_pattern (string)
- print_speed (mm/s)
- outer_wall_speed (mm/s)
- inner_wall_speed (mm/s)
- infill_speed (mm/s)
- travel_speed (mm/s)
- first_layer_speed (mm/s)
- nozzle_temp (°C)
- bed_temp (°C)
- cooling_fan_speed (percentage)
- support_enabled (boolean)
- support_type (string, e.g. "tree" or "normal")
- support_angle (degrees)
- retraction_distance (mm)
- retraction_speed (mm/s)
- z_hop (mm)
- notes (string with brief explanation of key decisions)

Respond with ONLY the JSON object, no additional text.`
}
