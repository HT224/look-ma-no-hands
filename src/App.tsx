import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { TongueClickDetector, tongueGestureScore } from './gesture'

type Point = { x: number; y: number }
type Status = 'idle' | 'loading' | 'tracking' | 'paused' | 'error'

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// The camera feed is mirrored. A small crop makes the comfortable hand range
// cover the full viewport without requiring the finger to reach frame edges.
export const mapFingerToScreen = (tip: Point): Point => ({
  x: clamp(((1 - tip.x) - 0.08) / 0.84),
  y: clamp((tip.y - 0.08) / 0.84),
})

export const stabilizePointer = (previous: Point, next: Point, width: number, height: number): Point => {
  const distance = Math.hypot((next.x - previous.x) * width, (next.y - previous.y) * height)
  if (distance < 3) return previous
  const alpha = Math.min(0.72, Math.max(0.28, distance / 160))
  return { x: previous.x + (next.x - previous.x) * alpha, y: previous.y + (next.y - previous.y) * alpha }
}

const clickAt = (point: Point) => {
  const x = point.x * window.innerWidth
  const y = point.y * window.innerHeight
  const target = document.elementFromPoint(x, y) as HTMLElement | null
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }))
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const frameRef = useRef<number | null>(null)
  const detectorRef = useRef(new TongueClickDetector())
  const statusRef = useRef<Status>('idle')
  const smoothPointRef = useRef<Point>({ x: 0.5, y: 0.5 })
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const lastFaceFrameRef = useRef(0)

  const [status, setStatusState] = useState<Status>('idle')
  const [message, setMessage] = useState('Camera stays on this device. Nothing is recorded.')
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 })
  const [handVisible, setHandVisible] = useState(false)
  const [tongueScore, setTongueScore] = useState(0)
  const [lastClick, setLastClick] = useState<number | null>(null)
  const [dictating, setDictating] = useState(false)
  const [transcript, setTranscript] = useState('')

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next
    setStatusState(next)
  }, [])

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach((track) => track.stop())
    handRef.current?.close()
    faceRef.current?.close()
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    const pauseOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && statusRef.current === 'tracking') {
        setStatus('paused')
        setMessage('Paused. Press Resume tracking when ready.')
      }
    }
    window.addEventListener('keydown', pauseOnEscape)
    return () => window.removeEventListener('keydown', pauseOnEscape)
  }, [setStatus])

  const processFrame = useCallback(() => {
    const video = videoRef.current
    const handLandmarker = handRef.current
    if (!video || !handLandmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(processFrame)
      return
    }

    const now = performance.now()
    const handResult = handLandmarker.detectForVideo(video, now)
    const tip = handResult.landmarks[0]?.[8]
    setHandVisible(Boolean(tip))

    if (tip && statusRef.current === 'tracking') {
      const next = mapFingerToScreen(tip)
      const stable = stabilizePointer(smoothPointRef.current, next, Math.max(window.innerWidth, 1), Math.max(window.innerHeight, 1))
      smoothPointRef.current = stable
      setCursor(stable)
    }

    // Tongue detection does not need the hand tracker's full frame rate.
    if (faceRef.current && now - lastFaceFrameRef.current > 65) {
      lastFaceFrameRef.current = now
      const faceResult = faceRef.current.detectForVideo(video, now)
      const score = tongueGestureScore(faceResult.faceLandmarks[0], faceResult.faceBlendshapes[0]?.categories)
      setTongueScore(score)
      if (statusRef.current === 'tracking' && detectorRef.current.update(score, now)) {
        clickAt(smoothPointRef.current)
        setLastClick(Date.now())
      }
    }

    frameRef.current = requestAnimationFrame(processFrame)
  }, [])

  const startCamera = async () => {
    if (!videoRef.current || handRef.current) return
    setStatus('loading')
    setMessage('Loading MediaPipe hand and face tracking…')
    try {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm')
      const [hand, face] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 1,
        }),
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        }),
      ])
      handRef.current = hand
      faceRef.current = face
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setStatus('tracking')
      setMessage('Tracking. Point with your index finger; stick out your tongue to click.')
      frameRef.current = requestAnimationFrame(processFrame)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Could not start finger tracking.')
    }
  }

  const toggleTracking = () => {
    const resuming = status !== 'tracking'
    setStatus(resuming ? 'tracking' : 'paused')
    setMessage(resuming ? 'Tracking resumed. Point with your index finger.' : 'Paused.')
  }

  const toggleDictation = () => {
    if (dictating) { recognitionRef.current?.stop(); return }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) { setMessage('Voice typing is not supported here. Use Chrome or Edge.'); return }
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

  const active = status === 'tracking'
  return (
    <main>
      <header>
        <div><span className="eyebrow">EXPERIMENT 001 · POWERED BY MEDIAPIPE HANDS</span><h1>Look Ma,<br /><em>No Mouse.</em></h1></div>
        <div className={`status ${active ? 'live' : ''}`}><span />{status}</div>
      </header>

      <section className="hero-grid">
        <div className="camera-card">
          <video id="tracking-camera" ref={videoRef} muted playsInline />
          {status === 'idle' && <div className="camera-empty">☝️</div>}
          <div className="camera-label">LOCAL CAMERA FEED · {handVisible ? 'FINGER FOUND' : 'SHOW INDEX FINGER'}</div>
          <div className="tongue-meter"><span style={{ width: `${Math.min(100, tongueScore * 160)}%` }} /></div>
        </div>

        <div className="control-card">
          <p className="message">{message}</p>
          <div className="steps">
            <div className={status !== 'idle' ? 'done' : ''}><b>1</b><span>Enable camera<small>Your video never leaves this browser.</small></span></div>
            <div className={handVisible ? 'done' : ''}><b>2</b><span>Point with one finger<small>Your index fingertip moves the cursor. No calibration.</small></span></div>
            <div className={active ? 'done' : ''}><b>3</b><span>Stick out your tongue<small>Tongue out = click. Esc = pause.</small></span></div>
          </div>
          <div className="actions">
            {status === 'idle' || status === 'error'
              ? <button className="primary" onClick={startCamera}>Start camera</button>
              : <button className="primary" disabled={status === 'loading'} onClick={toggleTracking}>{active ? 'Pause tracking' : 'Resume tracking'}</button>}
          </div>
        </div>
      </section>

      <section className="playground">
        <div className="playground-head"><div><span className="eyebrow">VOICE PLAYGROUND</span><h2>Say something.</h2></div><button className={dictating ? 'recording' : ''} onClick={toggleDictation}>{dictating ? '■ Stop listening' : '● Start dictating'}</button></div>
        <textarea value={transcript} onChange={(event) => { transcriptRef.current = event.target.value; setTranscript(event.target.value) }} placeholder="Your words will land here…" />
        <div className="targets"><button onClick={() => setMessage('Bullseye one clicked.')}>CLICK ME</button><button onClick={() => setMessage('Bullseye two clicked.')}>NO, ME</button><button onClick={() => setMessage('Excellent tongue work.')}>🎯</button></div>
      </section>

      {active && handVisible && <div className={`gaze-cursor ${lastClick && Date.now() - lastClick < 350 ? 'clicked' : ''}`} style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} />}
    </main>
  )
}

export default App
