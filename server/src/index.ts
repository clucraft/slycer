import express from 'express'
import cors from 'cors'
import { optimizeRouter } from './routes/optimize.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api', optimizeRouter)

// Serve generated 3MF files
app.use('/downloads', express.static('output'))

app.listen(PORT, () => {
  console.log(`Slycer server running on port ${PORT}`)
})
