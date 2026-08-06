import { useCallback, useEffect, useRef, useState } from 'react'
import { WebcamClient, WebEyeTrackProxy, type GazeResult } from 'webeyetrack'
import { TongueClickDetector } from './gesture'

type Point = { x: number; y: number }
type Status = 'idle' | 'loading' | 'ready' | 'calibrating' | 'tracking' | 'error'

// WebEyeTrack retains five personalization samples. This ordering covers the
// whole viewport and leaves the center as the final, most recent sample.
const CALIBRATION_POINTS: Point[] = [
  { x: 0.12, y: 0.14 },
  { x: 0.88, y: 0.14 },
  { x: 0.12, y: 0.86 },
  { x: 0.88, y: 0.86 },
  { x: 0.5, y: 0.5 },
]

const normalizedPoint = (normPog: number[]): Point => ({
  x: Math.min(1, Math.max(0, normPog[0] + 0.5)),
  y: Math.min(1, Math.max(0, normPog[1] + 0.5)),
})

const stabilize = (previous: Point, next: Point): Point => {
  const width = Math.max(window.innerWidth, 1)
  const height = Math.max(window.innerHeight, 1)
  const pixelDistance = Math.hypot((next.x - previous.x) * width, (next.y - previous.y) * height)
  if (pixelDistance < 7) return previous
  // WebEyeTrack already applies a Kalman filter. This light presentation layer
  // damps webcam micro-jitter while still allowing fast long-distance travel.
  const alpha = Math.min(0.42, Math.max(0.12, pixelDistance / 450))
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  }
}

const tongueScoreFrom = (result: GazeResult) =>
  result.faceBlendshapes[0]?.categories.find((category) => category.categoryName === 'tongueOut')?.score ?? 0

const clickAt = (point: Point) => {
  const x = point.x * window.innerWidth
  const y = point.y * window.innerHeight
  const target = document.elementFromPoint(x, y) as HTMLElement | null
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }))
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const proxyRef = useRef<WebEyeTrackProxy | null>(null)
  const detectorRef = useRef(new TongueClickDetector())
  const statusRef = useRef<Status>('idle')
  const smoothPointRef = useRef<Point>({ x: 0.5, y: 0.5 })
  const calibrationTimerRef = useRef<number | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')

  const [status, setStatusState] = useState<Status>('idle')
  const [message, setMessage] = useState('Camera stays on this device. Nothing is recorded.')
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 })
  const [calibrationIndex, setCalibrationIndex] = useState(-1)
  const [calibrated, setCalibrated] = useState(false)
  const [tongueScore, setTongueScore] = useState(0)
  const [lastClick, setLastClick] = useState<number | null>(null)
  const [dictating, setDictating] = useState(false)
  const [transcript, setTranscript] = useState('')

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next
    setStatusState(next)
  }, [])

  useEffect(() => () => {
    if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current)
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach((track) => track.stop())
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    const pauseOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status === 'tracking') {
        setStatus('ready')
        setMessage('Paused. Press Resume tracking when ready.')
      }
    }
    window.addEventListener('keydown', pauseOnEscape)
    return () => window.removeEventListener('keydown', pauseOnEscape)
  }, [setStatus, status])

  const startCamera = async () => {
    if (!videoRef.current || proxyRef.current) return
    setStatus('loading')
    setMessage('Loading WebEyeTrack’s neural gaze model…')
    try {
      const webcamClient = new WebcamClient(videoRef.current.id)
      const proxy = new WebEyeTrackProxy(webcamClient)
      proxyRef.current = proxy
      let firstResult = true
      proxy.onGazeResults = (result: GazeResult) => {
        if (firstResult) {
          firstResult = false
          setStatus('ready')
          setMessage('WebEyeTrack is ready. Sit comfortably, then calibrate.')
        }
        if (!result.facialLandmarks.length) return
        const score = tongueScoreFrom(result)
        setTongueScore(score)
        if (statusRef.current !== 'tracking' || result.gazeState === 'closed') return

        const stable = stabilize(smoothPointRef.current, normalizedPoint(result.normPog))
        smoothPointRef.current = stable
        setCursor(stable)
        if (detectorRef.current.update(score, performance.now())) {
          clickAt(stable)
          setLastClick(Date.now())
        }
      }
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Could not start WebEyeTrack.')
    }
  }

  const calibrate = () => {
    if (!proxyRef.current) return
    if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current)
    setCalibrated(false)
    setCalibrationIndex(0)
    setStatus('calibrating')
    setMessage('Keep your head comfortable and look directly at each dot.')

    const capturePoint = (index: number) => {
      const point = CALIBRATION_POINTS[index]
      calibrationTimerRef.current = window.setTimeout(() => {
        // WebEyeTrack personalizes its neural model from click coordinates.
        window.dispatchEvent(new MouseEvent('click', {
          clientX: point.x * window.innerWidth,
          clientY: point.y * window.innerHeight,
        }))
        const next = index + 1
        if (next < CALIBRATION_POINTS.length) {
          setCalibrationIndex(next)
          capturePoint(next)
        } else {
          setCalibrationIndex(-1)
          setCalibrated(true)
          setStatus('tracking')
          setMessage('Tracking. Look to move, stick out your tongue to click.')
        }
      }, 1700)
    }
    capturePoint(0)
  }

  const toggleTracking = () => {
    if (!calibrated) return calibrate()
    const resuming = status !== 'tracking'
    setStatus(resuming ? 'tracking' : 'ready')
    setMessage(resuming ? 'Tracking resumed.' : 'Paused.')
  }

  const toggleDictation = () => {
    if (dictating) {
      recognitionRef.current?.stop()
      return
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setMessage('Voice typing is not supported here. Use Chrome or Edge.')
      return
    }
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let committed = transcriptRef.current
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = event.results[i][0].transcript
        if (event.results[i].isFinal) committed += `${phrase.trim()} `
        else interim += phrase
      }
      transcriptRef.current = committed
      setTranscript(committed + interim)
    }
    recognition.onerror = (event) => setMessage(`Voice recognition: ${event.error}`)
    recognition.onend = () => setDictating(false)
    recognitionRef.current = recognition
    recognition.start()
    setDictating(true)
  }

  const target = calibrationIndex >= 0 ? CALIBRATION_POINTS[calibrationIndex] : null
  const active = status === 'tracking'

  return (
    <main>
      <header>
        <div><span className="eyebrow">EXPERIMENT 001 · POWERED BY WEBEYETRACK</span><h1>Look Ma,<br /><em>No Hands.</em></h1></div>
        <div className={`status ${active ? 'live' : ''}`}><span />{status}</div>
      </header>

      <section className="hero-grid">
        <div className="camera-card">
          <video id="webeyetrack-camera" ref={videoRef} muted playsInline />
          {status === 'idle' && <div className="camera-empty">👀</div>}
          <div className="camera-label">LOCAL CAMERA FEED</div>
          <div className="tongue-meter"><span style={{ width: `${Math.min(100, tongueScore * 160)}%` }} /></div>
        </div>

        <div className="control-card">
          <p className="message">{message}</p>
          <div className="steps">
            <div className={status !== 'idle' ? 'done' : ''}><b>1</b><span>Enable camera<small>Your video never leaves this browser.</small></span></div>
            <div className={calibrated ? 'done' : ''}><b>2</b><span>Personalize WebEyeTrack<small>Follow five dots with your eyes.</small></span></div>
            <div className={active ? 'done' : ''}><b>3</b><span>Go hands-free<small>Tongue out = click. Esc = pause.</small></span></div>
          </div>
          <div className="actions">
            {status === 'idle' || status === 'error' ? <button className="primary" onClick={startCamera}>Start camera</button> :
              !calibrated ? <button className="primary" disabled={status === 'loading' || status === 'calibrating'} onClick={calibrate}>Calibrate</button> :
              <button className="primary" onClick={toggleTracking}>{active ? 'Pause tracking' : 'Resume tracking'}</button>}
            {status !== 'idle' && status !== 'loading' && <button onClick={calibrate}>Recalibrate</button>}
          </div>
        </div>
      </section>

      <section className="playground">
        <div className="playground-head"><div><span className="eyebrow">VOICE PLAYGROUND</span><h2>Say something.</h2></div><button className={dictating ? 'recording' : ''} onClick={toggleDictation}>{dictating ? '■ Stop listening' : '● Start dictating'}</button></div>
        <textarea value={transcript} onChange={(event) => { transcriptRef.current = event.target.value; setTranscript(event.target.value) }} placeholder="Your words will land here…" />
        <div className="targets"><button onClick={() => setMessage('Bullseye one clicked.')}>CLICK ME</button><button onClick={() => setMessage('Bullseye two clicked.')}>NO, ME</button><button onClick={() => setMessage('Excellent tongue work.')}>🎯</button></div>
      </section>

      {active && <div className={`gaze-cursor ${lastClick && Date.now() - lastClick < 350 ? 'clicked' : ''}`} style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} />}
      {target && <div className="calibration-overlay"><div className="calibration-copy">LOOK AT THE DOT <b>{calibrationIndex + 1}/5</b></div><div className="calibration-dot" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} /></div>}
    </main>
  )
}

export default App
