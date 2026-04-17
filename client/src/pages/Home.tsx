import { useState, useCallback } from 'react'
import { Upload, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

const PRINTERS = [
  // Bambu Lab
  { value: 'bambu-x2d', label: 'Bambu Lab X2D' },
  { value: 'bambu-x1c', label: 'Bambu Lab X1 Carbon' },
  { value: 'bambu-x1e', label: 'Bambu Lab X1E' },
  { value: 'bambu-p2s', label: 'Bambu Lab P2S' },
  { value: 'bambu-p1s', label: 'Bambu Lab P1S' },
  { value: 'bambu-p1p', label: 'Bambu Lab P1P' },
  { value: 'bambu-a1', label: 'Bambu Lab A1' },
  { value: 'bambu-a1-mini', label: 'Bambu Lab A1 Mini' },
  { value: 'bambu-h2c', label: 'Bambu Lab H2C' },
  { value: 'bambu-h2d', label: 'Bambu Lab H2D' },
  { value: 'bambu-h2s', label: 'Bambu Lab H2S' },
  // Prusa
  { value: 'prusa-mk4s', label: 'Prusa MK4S' },
  { value: 'prusa-mk3s', label: 'Prusa MK3S+' },
  { value: 'prusa-mini', label: 'Prusa Mini+' },
  { value: 'prusa-xl', label: 'Prusa XL' },
  { value: 'prusa-core-one', label: 'Prusa CORE One' },
  { value: 'prusa-pro-ht90', label: 'Prusa Pro HT90' },
  // Creality
  { value: 'creality-k2-pro', label: 'Creality K2 Pro' },
  { value: 'creality-k2-plus', label: 'Creality K2 Plus' },
  { value: 'creality-k1-max', label: 'Creality K1 Max' },
  { value: 'creality-k1c', label: 'Creality K1C' },
  { value: 'creality-ender3-v3', label: 'Creality Ender-3 V3' },
  { value: 'creality-sermoon-x1', label: 'Creality Sermoon X1' },
  // Voron
  { value: 'voron-2.4', label: 'Voron 2.4' },
  { value: 'voron-trident', label: 'Voron Trident' },
  { value: 'voron-v0.2', label: 'Voron V0.2' },
  { value: 'voron-switchwire', label: 'Voron Switchwire' },
  { value: 'voron-legacy', label: 'Voron Legacy' },
  // Elegoo
  { value: 'elegoo-centauri-carbon-2', label: 'Elegoo Centauri Carbon 2' },
  { value: 'elegoo-centauri-carbon', label: 'Elegoo Centauri Carbon' },
  { value: 'elegoo-neptune-4-max', label: 'Elegoo Neptune 4 Max' },
  { value: 'elegoo-neptune-4-plus', label: 'Elegoo Neptune 4 Plus' },
  { value: 'elegoo-neptune-4-pro', label: 'Elegoo Neptune 4 Pro' },
  { value: 'elegoo-neptune-4', label: 'Elegoo Neptune 4' },
  { value: 'elegoo-orangestorm-giga', label: 'Elegoo OrangeStorm Giga' },
  // AnkerMake
  { value: 'ankermake-m5-pro', label: 'AnkerMake M5 Pro' },
  { value: 'ankermake-m5', label: 'AnkerMake M5' },
  { value: 'ankermake-m5c', label: 'AnkerMake M5C' },
]

const NOZZLE_SIZES = [
  { value: '0.2', label: '0.2mm' },
  { value: '0.4', label: '0.4mm' },
  { value: '0.6', label: '0.6mm' },
  { value: '0.8', label: '0.8mm' },
]

const MATERIALS = [
  { value: 'pla', label: 'PLA' },
  { value: 'pla+', label: 'PLA+' },
  { value: 'petg', label: 'PETG' },
  { value: 'abs', label: 'ABS' },
  { value: 'asa', label: 'ASA' },
  { value: 'tpu', label: 'TPU' },
  { value: 'nylon', label: 'Nylon' },
  { value: 'pc', label: 'Polycarbonate' },
]

const SLICERS = [
  { value: 'bambu-studio', label: 'Bambu Studio' },
  { value: 'orcaslicer', label: 'OrcaSlicer' },
  { value: 'prusaslicer', label: 'PrusaSlicer' },
  { value: 'cura', label: 'Cura' },
]

const PRIORITIES = [
  { value: 'balanced', label: 'Balanced', description: 'Good all-around defaults' },
  { value: 'quality', label: 'Quality', description: 'Best surface finish & detail' },
  { value: 'strength', label: 'Strength', description: 'Maximum mechanical strength' },
  { value: 'speed', label: 'Speed', description: 'Fastest print time' },
]

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [printer, setPrinter] = useState('bambu-x1c')
  const [nozzle, setNozzle] = useState('0.4')
  const [material, setMaterial] = useState('pla')
  const [slicer, setSlicer] = useState('orcaslicer')
  const [priority, setPriority] = useState('balanced')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [settings, setSettings] = useState<Record<string, string | number> | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile?.name.toLowerCase().endsWith('.stl')) {
      setFile(droppedFile)
      setStatus('idle')
      setError('')
      setDownloadUrl('')
      setSettings(null)
    } else {
      setError('Please upload an STL file')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setStatus('idle')
      setError('')
      setDownloadUrl('')
      setSettings(null)
    }
  }

  const handleSubmit = async () => {
    if (!file) return

    setStatus('uploading')
    setError('')
    setDownloadUrl('')
    setSettings(null)

    const formData = new FormData()
    formData.append('stl', file)
    formData.append('printer', printer)
    formData.append('nozzle', nozzle)
    formData.append('material', material)
    formData.append('slicer', slicer)
    formData.append('priority', priority)

    try {
      setStatus('processing')
      const response = await axios.post('/api/optimize', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setSettings(response.data.settings)
      setDownloadUrl(response.data.downloadUrl)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Failed to process file')
      } else {
        setError('An unexpected error occurred')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Upload STL Model</h2>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
            ${file ? 'border-primary-500/50 bg-primary-500/5' : 'border-surface-600 hover:border-primary-500/30'}`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".stl"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary-400" />
              <div>
                <p className="text-zinc-200 font-medium">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          ) : (
            <div>
              <Upload className="h-10 w-10 text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-400">Drag & drop an STL file here, or click to browse</p>
              <p className="text-xs text-zinc-600 mt-1">Supports .stl files</p>
            </div>
          )}
        </div>
      </div>

      {/* Print settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Print Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Printer</label>
            <select value={printer} onChange={(e) => setPrinter(e.target.value)} className="input">
              {PRINTERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Nozzle Size</label>
            <select value={nozzle} onChange={(e) => setNozzle(e.target.value)} className="input">
              {NOZZLE_SIZES.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Material</label>
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className="input">
              {MATERIALS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Slicer</label>
            <select value={slicer} onChange={(e) => setSlicer(e.target.value)} className="input">
              {SLICERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Priority selector */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Optimization Priority</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`p-4 rounded-lg border transition-all text-left ${
                priority === p.value
                  ? 'bg-primary-600/20 border-primary-500/50 glow-primary'
                  : 'bg-surface-900/50 border-surface-600 hover:border-primary-500/30'
              }`}
            >
              <div className={`text-sm font-semibold mb-1 ${priority === p.value ? 'text-primary-400' : 'text-zinc-200'}`}>
                {p.label}
              </div>
              <div className="text-xs text-zinc-500">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSubmit}
          disabled={!file || status === 'uploading' || status === 'processing'}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'uploading' || status === 'processing' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {status === 'uploading' ? 'Uploading...' : 'Analyzing & Optimizing...'}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Optimize Settings
            </>
          )}
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download 3MF
          </a>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {settings && (
        <div className="card">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Optimized Settings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(settings).map(([key, value]) => (
              <div key={key} className="bg-surface-900/50 rounded-lg p-3 border border-surface-600">
                <p className="text-xs text-zinc-500 mb-1">{key.replace(/_/g, ' ')}</p>
                <p className="text-sm text-primary-400 font-medium">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
