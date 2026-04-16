import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { analyzeSTL } from '../services/meshAnalyzer.js'
import { generateSettings } from '../services/aiOptimizer.js'
import { build3MF } from '../services/threemfBuilder.js'

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.stl') {
      cb(null, true)
    } else {
      cb(new Error('Only STL files are allowed'))
    }
  },
})

export const optimizeRouter = Router()

optimizeRouter.post('/optimize', upload.single('stl'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No STL file provided' })
      return
    }

    const { printer, nozzle, material, slicer } = req.body

    if (!printer || !nozzle || !material || !slicer) {
      res.status(400).json({ error: 'Missing required fields: printer, nozzle, material, slicer' })
      return
    }

    // Step 1: Analyze STL mesh geometry
    const meshAnalysis = await analyzeSTL(req.file.path)

    // Step 2: Generate optimized settings via AI
    const settings = await generateSettings({
      meshAnalysis,
      printer,
      nozzle: parseFloat(nozzle),
      material,
      slicer,
    })

    // Step 3: Build 3MF with optimized settings
    const outputFilename = `${path.parse(req.file.originalname).name}_optimized.3mf`
    const outputPath = await build3MF({
      stlPath: req.file.path,
      stlFilename: req.file.originalname,
      settings,
      slicer,
      outputFilename,
    })

    res.json({
      settings: settings,
      downloadUrl: `/downloads/${outputFilename}`,
    })
  } catch (err) {
    console.error('Optimization error:', err)
    res.status(500).json({ error: 'Failed to optimize print settings' })
  }
})
