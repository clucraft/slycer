import fs from 'fs'

export interface MeshAnalysis {
  triangleCount: number
  volume: number
  surfaceArea: number
  boundingBox: {
    x: number
    y: number
    z: number
  }
  maxOverhangAngle: number
  thinWallCount: number
  hasBridging: boolean
}

// Parse binary STL file and extract mesh metrics
export async function analyzeSTL(filePath: string): Promise<MeshAnalysis> {
  const buffer = fs.readFileSync(filePath)

  // Detect if ASCII or binary STL
  const header = buffer.subarray(0, 80)
  const isAscii = header.toString('utf8').trimStart().toLowerCase().startsWith('solid')
    && buffer.toString('utf8', 0, 200).includes('facet')

  if (isAscii) {
    return analyzeAsciiSTL(buffer.toString('utf8'))
  }
  return analyzeBinarySTL(buffer)
}

function analyzeBinarySTL(buffer: Buffer): MeshAnalysis {
  const triangleCount = buffer.readUInt32LE(80)

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let totalVolume = 0
  let totalArea = 0
  let maxOverhang = 0
  let thinWalls = 0
  let hasBridging = false

  const offset = 84

  for (let i = 0; i < triangleCount; i++) {
    const base = offset + i * 50

    // Normal
    const nx = buffer.readFloatLE(base)
    const ny = buffer.readFloatLE(base + 4)
    const nz = buffer.readFloatLE(base + 8)

    // Vertices
    const v1x = buffer.readFloatLE(base + 12)
    const v1y = buffer.readFloatLE(base + 16)
    const v1z = buffer.readFloatLE(base + 20)
    const v2x = buffer.readFloatLE(base + 24)
    const v2y = buffer.readFloatLE(base + 28)
    const v2z = buffer.readFloatLE(base + 32)
    const v3x = buffer.readFloatLE(base + 36)
    const v3y = buffer.readFloatLE(base + 40)
    const v3z = buffer.readFloatLE(base + 44)

    // Bounding box
    minX = Math.min(minX, v1x, v2x, v3x)
    minY = Math.min(minY, v1y, v2y, v3y)
    minZ = Math.min(minZ, v1z, v2z, v3z)
    maxX = Math.max(maxX, v1x, v2x, v3x)
    maxY = Math.max(maxY, v1y, v2y, v3y)
    maxZ = Math.max(maxZ, v1z, v2z, v3z)

    // Triangle area (cross product)
    const ex1 = v2x - v1x, ey1 = v2y - v1y, ez1 = v2z - v1z
    const ex2 = v3x - v1x, ey2 = v3y - v1y, ez2 = v3z - v1z
    const cx = ey1 * ez2 - ez1 * ey2
    const cy = ez1 * ex2 - ex1 * ez2
    const cz = ex1 * ey2 - ey1 * ex2
    const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
    totalArea += area

    // Signed volume contribution (for total volume calculation)
    totalVolume += (v1x * (v2y * v3z - v3y * v2z) +
                    v2x * (v3y * v1z - v1y * v3z) +
                    v3x * (v1y * v2z - v2y * v1z)) / 6.0

    // Overhang detection: angle between normal and Z-down
    const normalLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (normalLen > 0) {
      const downAngle = Math.acos(Math.max(-1, Math.min(1, -nz / normalLen))) * (180 / Math.PI)
      if (downAngle < 90) {
        maxOverhang = Math.max(maxOverhang, 90 - downAngle)
      }
    }

    // Bridging: faces pointing straight down
    if (normalLen > 0 && (nz / normalLen) < -0.95) {
      hasBridging = true
    }

    // Thin wall heuristic: very narrow triangles at similar Z levels
    const zSpread = Math.max(v1z, v2z, v3z) - Math.min(v1z, v2z, v3z)
    const maxEdgeLen = Math.max(
      Math.sqrt(ex1 * ex1 + ey1 * ey1 + ez1 * ez1),
      Math.sqrt(ex2 * ex2 + ey2 * ey2 + ez2 * ez2),
    )
    if (area > 0 && maxEdgeLen > 0) {
      const minHeight = (2 * area) / maxEdgeLen
      if (minHeight < 0.8 && zSpread < 0.5) {
        thinWalls++
      }
    }
  }

  return {
    triangleCount,
    volume: Math.abs(totalVolume) / 1000, // mm³ to cm³
    surfaceArea: totalArea / 100, // mm² to cm²
    boundingBox: {
      x: Math.round((maxX - minX) * 100) / 100,
      y: Math.round((maxY - minY) * 100) / 100,
      z: Math.round((maxZ - minZ) * 100) / 100,
    },
    maxOverhangAngle: Math.round(maxOverhang * 10) / 10,
    thinWallCount: thinWalls,
    hasBridging,
  }
}

function analyzeAsciiSTL(content: string): MeshAnalysis {
  // Parse ASCII STL and delegate to similar logic
  const facetRegex = /facet\s+normal\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+outer\s+loop\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+endloop\s+endfacet/gi

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let totalVolume = 0
  let totalArea = 0
  let maxOverhang = 0
  let thinWalls = 0
  let hasBridging = false
  let triangleCount = 0

  let match
  while ((match = facetRegex.exec(content)) !== null) {
    triangleCount++
    const nx = parseFloat(match[1]), ny = parseFloat(match[2]), nz = parseFloat(match[3])
    const v1x = parseFloat(match[4]), v1y = parseFloat(match[5]), v1z = parseFloat(match[6])
    const v2x = parseFloat(match[7]), v2y = parseFloat(match[8]), v2z = parseFloat(match[9])
    const v3x = parseFloat(match[10]), v3y = parseFloat(match[11]), v3z = parseFloat(match[12])

    minX = Math.min(minX, v1x, v2x, v3x)
    minY = Math.min(minY, v1y, v2y, v3y)
    minZ = Math.min(minZ, v1z, v2z, v3z)
    maxX = Math.max(maxX, v1x, v2x, v3x)
    maxY = Math.max(maxY, v1y, v2y, v3y)
    maxZ = Math.max(maxZ, v1z, v2z, v3z)

    const ex1 = v2x - v1x, ey1 = v2y - v1y, ez1 = v2z - v1z
    const ex2 = v3x - v1x, ey2 = v3y - v1y, ez2 = v3z - v1z
    const cx = ey1 * ez2 - ez1 * ey2
    const cy = ez1 * ex2 - ex1 * ez2
    const cz = ex1 * ey2 - ey1 * ex2
    const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
    totalArea += area

    totalVolume += (v1x * (v2y * v3z - v3y * v2z) +
                    v2x * (v3y * v1z - v1y * v3z) +
                    v3x * (v1y * v2z - v2y * v1z)) / 6.0

    const normalLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (normalLen > 0) {
      const downAngle = Math.acos(Math.max(-1, Math.min(1, -nz / normalLen))) * (180 / Math.PI)
      if (downAngle < 90) {
        maxOverhang = Math.max(maxOverhang, 90 - downAngle)
      }
    }

    if (normalLen > 0 && (nz / normalLen) < -0.95) {
      hasBridging = true
    }

    const zSpread = Math.max(v1z, v2z, v3z) - Math.min(v1z, v2z, v3z)
    const maxEdgeLen = Math.max(
      Math.sqrt(ex1 * ex1 + ey1 * ey1 + ez1 * ez1),
      Math.sqrt(ex2 * ex2 + ey2 * ey2 + ez2 * ez2),
    )
    if (area > 0 && maxEdgeLen > 0) {
      const minHeight = (2 * area) / maxEdgeLen
      if (minHeight < 0.8 && zSpread < 0.5) {
        thinWalls++
      }
    }
  }

  return {
    triangleCount,
    volume: Math.abs(totalVolume) / 1000,
    surfaceArea: totalArea / 100,
    boundingBox: {
      x: Math.round((maxX - minX) * 100) / 100,
      y: Math.round((maxY - minY) * 100) / 100,
      z: Math.round((maxZ - minZ) * 100) / 100,
    },
    maxOverhangAngle: Math.round(maxOverhang * 10) / 10,
    thinWallCount: thinWalls,
    hasBridging,
  }
}
