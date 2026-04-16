import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import type { PrintSettings } from './aiOptimizer.js'

interface Build3MFOptions {
  stlPath: string
  settings: PrintSettings
  slicer: string
  outputFilename: string
}

export async function build3MF(options: Build3MFOptions): Promise<string> {
  const { stlPath, settings, slicer, outputFilename } = options

  const zip = new JSZip()

  // Read the STL file
  const stlBuffer = fs.readFileSync(stlPath)

  // 3MF content types
  zip.file('[Content_Types].xml', contentTypesXML())

  // Relationships
  const relsFolder = zip.folder('_rels')!
  relsFolder.file('.rels', relsXML())

  // 3D model with embedded STL mesh
  const threeDFolder = zip.folder('3D')!
  threeDFolder.file('3dmodel.model', modelXML(stlBuffer))

  // Slicer-specific config
  const metadataFolder = zip.folder('Metadata')!
  metadataFolder.file('slicer_settings.config', buildSlicerConfig(settings, slicer))

  // Add print profile metadata based on slicer type
  if (slicer === 'bambu-studio' || slicer === 'orcaslicer') {
    metadataFolder.file('plate_1.config', buildOrcaBambuPlateConfig(settings))
    metadataFolder.file('project_settings.config', buildOrcaBambuProjectConfig(settings))
  } else if (slicer === 'prusaslicer') {
    metadataFolder.file('Slic3r_PE_model.config', buildPrusaConfig(settings))
  }

  // Ensure output directory exists
  const outputDir = path.resolve('output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, outputFilename)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(outputPath, buffer)

  // Clean up uploaded file
  fs.unlinkSync(stlPath)

  return outputPath
}

function contentTypesXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="text/xml"/>
</Types>`
}

function relsXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
}

function modelXML(stlBuffer: Buffer): string {
  // Parse STL to extract vertices for 3MF model format
  const mesh = parseSTLToMesh(stlBuffer)

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
  <metadata name="Application">Slycer</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${mesh.vertices.map(v => `          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join('\n')}
        </vertices>
        <triangles>
${mesh.triangles.map(t => `          <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`
}

interface Vertex {
  x: string
  y: string
  z: string
}

interface Triangle {
  v1: number
  v2: number
  v3: number
}

function parseSTLToMesh(buffer: Buffer): { vertices: Vertex[], triangles: Triangle[] } {
  const vertices: Vertex[] = []
  const triangles: Triangle[] = []
  const vertexMap = new Map<string, number>()

  // Check if ASCII STL
  const isAscii = buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase().startsWith('solid')
    && buffer.toString('utf8', 0, 200).includes('facet')

  if (isAscii) {
    return parseAsciiSTLToMesh(buffer.toString('utf8'))
  }

  const triangleCount = buffer.readUInt32LE(80)

  for (let i = 0; i < triangleCount; i++) {
    const base = 84 + i * 50
    const triIndices: number[] = []

    for (let v = 0; v < 3; v++) {
      const vBase = base + 12 + v * 12
      const x = buffer.readFloatLE(vBase).toFixed(6)
      const y = buffer.readFloatLE(vBase + 4).toFixed(6)
      const z = buffer.readFloatLE(vBase + 8).toFixed(6)
      const key = `${x},${y},${z}`

      let idx = vertexMap.get(key)
      if (idx === undefined) {
        idx = vertices.length
        vertexMap.set(key, idx)
        vertices.push({ x, y, z })
      }
      triIndices.push(idx)
    }

    triangles.push({ v1: triIndices[0], v2: triIndices[1], v3: triIndices[2] })
  }

  return { vertices, triangles }
}

function parseAsciiSTLToMesh(content: string): { vertices: Vertex[], triangles: Triangle[] } {
  const vertices: Vertex[] = []
  const triangles: Triangle[] = []
  const vertexMap = new Map<string, number>()

  const facetRegex = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/gi
  const matches = [...content.matchAll(facetRegex)]

  for (let i = 0; i + 2 < matches.length; i += 3) {
    const triIndices: number[] = []

    for (let v = 0; v < 3; v++) {
      const m = matches[i + v]
      const x = parseFloat(m[1]).toFixed(6)
      const y = parseFloat(m[2]).toFixed(6)
      const z = parseFloat(m[3]).toFixed(6)
      const key = `${x},${y},${z}`

      let idx = vertexMap.get(key)
      if (idx === undefined) {
        idx = vertices.length
        vertexMap.set(key, idx)
        vertices.push({ x, y, z })
      }
      triIndices.push(idx)
    }

    triangles.push({ v1: triIndices[0], v2: triIndices[1], v3: triIndices[2] })
  }

  return { vertices, triangles }
}

function buildSlicerConfig(settings: PrintSettings, slicer: string): string {
  const lines = [`; Slycer optimized settings for ${slicer}`, `; Generated at ${new Date().toISOString()}`, '']

  for (const [key, value] of Object.entries(settings)) {
    if (key === 'notes') continue
    lines.push(`${key} = ${value}`)
  }

  if (settings.notes) {
    lines.push('', `; Notes: ${settings.notes}`)
  }

  return lines.join('\n')
}

function buildOrcaBambuPlateConfig(settings: PrintSettings): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="layer_height" value="${settings.layer_height}"/>
    <metadata key="first_layer_height" value="${settings.first_layer_height}"/>
    <metadata key="wall_loops" value="${settings.wall_count}"/>
    <metadata key="top_shell_layers" value="${settings.top_layers}"/>
    <metadata key="bottom_shell_layers" value="${settings.bottom_layers}"/>
    <metadata key="sparse_infill_density" value="${settings.infill_density}%"/>
    <metadata key="sparse_infill_pattern" value="${settings.infill_pattern}"/>
    <metadata key="print_speed" value="${settings.print_speed}"/>
    <metadata key="nozzle_temperature" value="${settings.nozzle_temp}"/>
    <metadata key="bed_temperature" value="${settings.bed_temp}"/>
  </plate>
</config>`
}

function buildOrcaBambuProjectConfig(settings: PrintSettings): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="optimized_model"/>
    <part id="1">
      <metadata key="name" value="part1"/>
      <metadata key="layer_height" value="${settings.layer_height}"/>
      <metadata key="wall_loops" value="${settings.wall_count}"/>
      <metadata key="sparse_infill_density" value="${settings.infill_density}%"/>
      <metadata key="sparse_infill_pattern" value="${settings.infill_pattern}"/>
      <metadata key="support_enabled" value="${settings.support_enabled ? 1 : 0}"/>
      <metadata key="support_type" value="${settings.support_type}"/>
      <metadata key="support_threshold_angle" value="${settings.support_angle}"/>
    </part>
  </object>
</config>`
}

function buildPrusaConfig(settings: PrintSettings): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1" instances_count="1">
    <metadata type="object" key="layer_height" value="${settings.layer_height}"/>
    <metadata type="object" key="perimeters" value="${settings.wall_count}"/>
    <metadata type="object" key="top_solid_layers" value="${settings.top_layers}"/>
    <metadata type="object" key="bottom_solid_layers" value="${settings.bottom_layers}"/>
    <metadata type="object" key="fill_density" value="${settings.infill_density}%"/>
    <metadata type="object" key="fill_pattern" value="${settings.infill_pattern}"/>
    <metadata type="object" key="support_material" value="${settings.support_enabled ? 1 : 0}"/>
    <metadata type="object" key="support_material_threshold" value="${settings.support_angle}"/>
  </object>
</config>`
}
