import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import type { PrintSettings } from './aiOptimizer.js'

interface Build3MFOptions {
  stlPath: string
  stlFilename: string
  settings: PrintSettings
  slicer: string
  outputFilename: string
}

export async function build3MF(options: Build3MFOptions): Promise<string> {
  const { stlPath, stlFilename, settings, slicer, outputFilename } = options

  const stlBuffer = fs.readFileSync(stlPath)
  const mesh = parseSTLToMesh(stlBuffer)
  const triangleCount = countTriangles(stlBuffer)

  let zip: JSZip

  if (slicer === 'bambu-studio' || slicer === 'orcaslicer') {
    zip = buildBambuOrcaZip(mesh, triangleCount, stlFilename, settings)
  } else if (slicer === 'prusaslicer') {
    zip = buildPrusaZip(mesh, stlFilename, settings)
  } else {
    zip = buildGenericZip(mesh, settings, slicer)
  }

  const outputDir = path.resolve('output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, outputFilename)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(outputPath, buffer)

  fs.unlinkSync(stlPath)

  return outputPath
}

// ─── Bambu Studio / OrcaSlicer format ───

function buildBambuOrcaZip(
  mesh: ParsedMesh,
  triangleCount: number,
  stlFilename: string,
  settings: PrintSettings,
): JSZip {
  const zip = new JSZip()

  // Content types
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`)

  // Root relationships
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)

  // Main 3dmodel.model (references object file)
  zip.folder('3D')!.file('3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">BambuStudio-01.10.00.00</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Copyright"></metadata>
 <metadata name="CreationDate">${new Date().toISOString().split('T')[0]}</metadata>
 <metadata name="Description"></metadata>
 <metadata name="Designer"></metadata>
 <metadata name="DesignerCover"></metadata>
 <metadata name="License"></metadata>
 <metadata name="ModificationDate">${new Date().toISOString().split('T')[0]}</metadata>
 <metadata name="Origin"></metadata>
 <metadata name="Title"></metadata>
 <resources>
  <object id="2" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model">
   <components>
    <component p:path="/3D/Objects/object_1.model" objectid="1" p:UUID="00010000-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
  <item objectid="2" p:UUID="00000002-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>
 </build>
</model>`)

  // Model rels (reference to object file)
  zip.folder('3D')!.folder('_rels')!.file('3dmodel.model.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)

  // Object model file (actual mesh data)
  zip.folder('3D')!.folder('Objects')!.file('object_1.model', buildObjectModelXML(mesh))

  // Metadata folder
  const meta = zip.folder('Metadata')!

  // project_settings.config — JSON format with Bambu/Orca native keys
  meta.file('project_settings.config', JSON.stringify(buildBambuProjectSettings(settings), null, 4))

  // model_settings.config — XML with object/plate info
  meta.file('model_settings.config', buildBambuModelSettings(stlFilename, triangleCount))

  // slice_info.config
  meta.file('slice_info.config', `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="01.00.00.00"/>
  </header>
</config>`)

  // plate JSON
  meta.file('plate_1.json', JSON.stringify({
    bbox_all: [0, 0, 256, 256],
    bbox_objects: [{
      area: 0,
      bbox: [0, 0, 256, 256],
      id: 1,
      layer_height: Number(settings.layer_height) || 0.2,
      name: stlFilename,
    }],
    bed_type: 'textured_plate',
    filament_colors: [],
    filament_ids: [],
    first_extruder: 0,
    is_seq_print: false,
    nozzle_diameter: Number(settings.nozzle_diameter) || 0.4,
    version: 2,
  }))

  // cut_information.xml
  meta.file('cut_information.xml', `<?xml version="1.0" encoding="utf-8"?>
<objects>
 <object id="1">
  <cut_id id="0" check_sum="1" connectors_cnt="0"/>
 </object>
</objects>`)

  return zip
}

function buildObjectModelXML(mesh: ParsedMesh): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <resources>
  <object id="1" p:UUID="00010000-b206-40ff-9872-83e8017abed1" type="model">
   <mesh>
    <vertices>
${mesh.vertices.map(v => `     <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join('\n')}
    </vertices>
    <triangles>
${mesh.triangles.map(t => `     <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
</model>`
}

function buildBambuProjectSettings(s: PrintSettings): Record<string, unknown> {
  // Map AI output to Bambu Studio's native JSON key names
  const nozzleTemp = String(s.nozzle_temp || 220)
  const bedTemp = String(s.bed_temp || 60)
  const layerHeight = Number(s.layer_height) || 0.2
  const firstLayerHeight = Number(s.first_layer_height) || 0.2
  const wallLoops = Number(s.wall_count) || 4
  const topLayers = Number(s.top_layers) || 5
  const bottomLayers = Number(s.bottom_layers) || 5
  const infillDensity = String(s.infill_density || 15) + '%'
  const infillPattern = String(s.infill_pattern || 'cubic')
  const printSpeed = String(s.print_speed || 200)
  const outerWallSpeed = String(s.outer_wall_speed || 150)
  const innerWallSpeed = String(s.inner_wall_speed || 200)
  const infillSpeed = String(s.infill_speed || 200)
  const travelSpeed = String(s.travel_speed || 400)
  const firstLayerSpeed = String(s.first_layer_speed || 50)
  const fanSpeed = String(s.cooling_fan_speed || 70)
  const supportEnabled = s.support_enabled ? '1' : '0'
  const supportType = String(s.support_type || 'tree(auto)')
  const supportAngle = String(s.support_angle || 30)
  const retractionDist = String(s.retraction_distance || 0.8)
  const retractionSpeed = String(s.retraction_speed || 30)
  const zHop = String(s.z_hop || 0.4)

  return {
    layer_height: layerHeight,
    initial_layer_print_height: firstLayerHeight,
    wall_loops: wallLoops,
    top_shell_layers: topLayers,
    bottom_shell_layers: bottomLayers,
    sparse_infill_density: infillDensity,
    sparse_infill_pattern: infillPattern,
    outer_wall_speed: [outerWallSpeed, outerWallSpeed],
    inner_wall_speed: [innerWallSpeed, innerWallSpeed],
    sparse_infill_speed: [infillSpeed, infillSpeed],
    travel_speed: [travelSpeed, travelSpeed],
    initial_layer_speed: [firstLayerSpeed, firstLayerSpeed],
    initial_layer_infill_speed: [firstLayerSpeed, firstLayerSpeed],
    nozzle_temperature: [nozzleTemp],
    nozzle_temperature_initial_layer: [nozzleTemp],
    hot_plate_temp: [bedTemp],
    hot_plate_temp_initial_layer: [bedTemp],
    textured_plate_temp: [bedTemp],
    textured_plate_temp_initial_layer: [bedTemp],
    cool_plate_temp: [bedTemp],
    cool_plate_temp_initial_layer: [bedTemp],
    fan_max_speed: [fanSpeed],
    fan_min_speed: [fanSpeed],
    enable_support: supportEnabled,
    support_type: supportType,
    support_threshold_angle: supportAngle,
    retraction_length: [retractionDist],
    retraction_speed: [retractionSpeed],
    z_hop: [zHop],
    z_hop_types: ['Auto Lift'],
    nozzle_diameter: ['0.4'],
    // Mark these as different from system defaults so slicer loads them
    different_settings_to_system: [
      'layer_height;wall_loops;top_shell_layers;bottom_shell_layers;sparse_infill_density;sparse_infill_pattern;enable_support;support_type;support_threshold_angle',
      '',
    ],
  }
}

function buildBambuModelSettings(stlFilename: string, triangleCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="2">
    <metadata key="name" value="${escapeXml(stlFilename)}"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="${triangleCount}"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="${escapeXml(stlFilename)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value="${escapeXml(stlFilename)}"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <mesh_stat face_count="${triangleCount}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="2"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
</config>`
}

// ─── PrusaSlicer format ───

function buildPrusaZip(mesh: ParsedMesh, stlFilename: string, settings: PrintSettings): JSZip {
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`)

  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)

  zip.folder('3D')!.file('3dmodel.model', buildPrusaModelXML(mesh, stlFilename, settings))

  zip.folder('Metadata')!.file('Slic3r_PE_model.config', buildPrusaModelConfig(settings))

  return zip
}

function buildPrusaModelXML(mesh: ParsedMesh, stlFilename: string, settings: PrintSettings): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
 <metadata name="slic3rpe:Version3mf" preserve="1">1</metadata>
 <metadata name="Application">Slycer</metadata>
 <resources>
  <object id="1" type="model">
   <metadata name="slic3rpe:source_file" type="xs:string">${escapeXml(stlFilename)}</metadata>
   <mesh>
    <vertices>
${mesh.vertices.map(v => `     <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join('\n')}
    </vertices>
    <triangles>
${mesh.triangles.map(t => `     <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>
 </build>
</model>`
}

function buildPrusaModelConfig(settings: PrintSettings): string {
  const lines = [
    `; generated by Slycer`,
    `[object:1]`,
    `layer_height = ${settings.layer_height || 0.2}`,
    `perimeters = ${settings.wall_count || 4}`,
    `top_solid_layers = ${settings.top_layers || 5}`,
    `bottom_solid_layers = ${settings.bottom_layers || 5}`,
    `fill_density = ${settings.infill_density || 15}%`,
    `fill_pattern = ${settings.infill_pattern || 'gyroid'}`,
    `support_material = ${settings.support_enabled ? 1 : 0}`,
    `support_material_auto = 1`,
    `support_material_threshold = ${settings.support_angle || 30}`,
    `support_material_style = ${String(settings.support_type).includes('tree') ? 'organic' : 'grid'}`,
  ]
  return lines.join('\n')
}

// ─── Generic / Cura format ───

function buildGenericZip(mesh: ParsedMesh, settings: PrintSettings, slicer: string): JSZip {
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`)

  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)

  zip.folder('3D')!.file('3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">Slycer</metadata>
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>
${mesh.vertices.map(v => `     <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join('\n')}
    </vertices>
    <triangles>
${mesh.triangles.map(t => `     <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1"/>
 </build>
</model>`)

  // Include settings as a readable config file
  const lines = [`; Slycer optimized settings for ${slicer}`, `; Generated at ${new Date().toISOString()}`, '']
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'notes') continue
    lines.push(`${key} = ${value}`)
  }
  if (settings.notes) {
    lines.push('', `; Notes: ${settings.notes}`)
  }
  zip.folder('Metadata')!.file('slycer_settings.config', lines.join('\n'))

  return zip
}

// ─── STL Parsing ───

interface Vertex { x: string; y: string; z: string }
interface Triangle { v1: number; v2: number; v3: number }
interface ParsedMesh { vertices: Vertex[]; triangles: Triangle[] }

function isAsciiSTL(buffer: Buffer): boolean {
  return buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase().startsWith('solid')
    && buffer.toString('utf8', 0, 200).includes('facet')
}

function countTriangles(buffer: Buffer): number {
  if (isAsciiSTL(buffer)) {
    const content = buffer.toString('utf8')
    return (content.match(/endfacet/gi) || []).length
  }
  return buffer.readUInt32LE(80)
}

function parseSTLToMesh(buffer: Buffer): ParsedMesh {
  if (isAsciiSTL(buffer)) {
    return parseAsciiSTLToMesh(buffer.toString('utf8'))
  }
  return parseBinarySTLToMesh(buffer)
}

function parseBinarySTLToMesh(buffer: Buffer): ParsedMesh {
  const vertices: Vertex[] = []
  const triangles: Triangle[] = []
  const vertexMap = new Map<string, number>()
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

function parseAsciiSTLToMesh(content: string): ParsedMesh {
  const vertices: Vertex[] = []
  const triangles: Triangle[] = []
  const vertexMap = new Map<string, number>()

  const vertexRegex = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/gi
  const matches = [...content.matchAll(vertexRegex)]

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

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
