import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { CALIBRATION_POINTS, fitCalibration, projectGaze, type CalibrationModel, type GazeSample, type Point } from './calibration'
import { TongueClickDetector } from './gesture'

type Status = 'idle' | 'loading' | 'ready' | 'calibrating' | 'tracking' | 'error'

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const irisCenter = (landmarks: NormalizedLandmark[], indexes: number[]) => ({
  x: average(indexes.map((index) => landmarks[index].x)),
  y: average(indexes.map((index) => landmarks[index].y)),
})

const gazeFeatures = (landmarks: NormalizedLandmark[]) => {
  const left = irisCenter(landmarks, [468, 469, 470, 471, 472])
  const right = irisCenter(landmarks, [473, 474, 475, 476, 477])
  const leftWidth = Math.abs(landmarks[133].x - landmarks[33].x) || 0.01
  const rightWidth = Math.abs(landmarks[263].x - landmarks[362].x) || 0.01
  const leftHeight = Math.abs(landmarks[159].y - landmarks[145].y) || 0.01
  const rightHeight = Math.abs(landmarks[386].y - landmarks[374].y) || 0.01
  const horizontal = average([
    (left.x - Math.min(landmarks[33].x, landmarks[133].x)) / leftWidth,
    (right.x - Math.min(landmarks[362].x, landmarks[263].x)) / rightWidth,
  ])
  const vertical = average([
    (left.y - Math.min(landmarks[159].y, landmarks[145].y)) / leftHeight,
    (right.y - Math.min(landmarks[386].y, landmarks[374].y)) / rightHeight,
  ])
  const faceLeft = landmarks[234]
  const faceRight = landmarks[454]
  const faceTop = landmarks[10]
  const faceBottom = landmarks[152]
  const headX = (landmarks[1].x - faceLeft.x) / (faceRight.x - faceLeft.x || 0.01)
  const headY = (landmarks[1].y - faceTop.y) / (faceBottom.y - faceTop.y || 0.01)
  return [horizontal, vertical, headX, headY]
}

const clickAt = (point: Point) => {
  const x = point.x * window.innerWidth
  const y = point.y * window.innerHeight
  const target = document.elementFromPoint(x, y) as HTMLElement | null
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }))
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const frameRef = useRef<number | null>(null)
  const detectorRef = useRef(new TongueClickDetector())
  const modelRef = useRef<CalibrationModel | null>(null)
  const samplesRef = useRef<GazeSample[]>([])
  const calibrationStartedRef = useRef(0)
  const calibrationIndexRef = useRef(-1)
  const smoothPointRef = useRef<Point>({ x: 0.5, y: 0.5 })
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')

  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('Camera stays on this device. Nothing is recorded.')
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 })
  const [calibrationIndex, setCalibrationIndex] = useState(-1)
  const [tongueScore, setTongueScore] = useState(0)
  const [lastClick, setLastClick] = useState<number | null>(null)
  const [dictating, setDictating] = useState(false)
  const [transcript, setTranscript] = useState('')

  const processFrame = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (!video || !landmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(processFrame)
      return
    }
    const now = performance.now()
    const result = landmarker.detectForVideo(video, now)
    const landmarks = result.faceLandmarks[0]
    if (landmarks) {
      const features = gazeFeatures(landmarks)
      const activeCalibrationIndex = calibrationIndexRef.current
      if (activeCalibrationIndex >= 0) {
        const elapsed = now - calibrationStartedRef.current
        if (elapsed > 450 && elapsed < 1150) {
          samplesRef.current.push({ features, target: CALIBRATION_POINTS[activeCalibrationIndex] })
        }
        if (elapsed >= 1200) {
          const next = activeCalibrationIndex + 1
          if (next < CALIBRATION_POINTS.length) {
            calibrationIndexRef.current = next
            setCalibrationIndex(next)
            calibrationStartedRef.current = now
          } else {
            calibrationIndexRef.current = -1
            setCalibrationIndex(-1)
            try {
              modelRef.current = fitCalibration(samplesRef.current)
              setStatus('tracking')
              setMessage('Tracking. Look to move, stick out your tongue to click.')
            } catch {
              setStatus('ready')
              setMessage('Calibration failed. Keep your face visible and try again.')
            }
          }
        }
      } else if (modelRef.current && status === 'tracking') {
        const raw = projectGaze(modelRef.current, features)
        const previous = smoothPointRef.current
        const smoothed = { x: previous.x * 0.72 + raw.x * 0.28, y: previous.y * 0.72 + raw.y * 0.28 }
        smoothPointRef.current = smoothed
        setCursor(smoothed)
      }

      const categories = result.faceBlendshapes[0]?.categories ?? []
      const score = categories.find((category) => category.categoryName === 'tongueOut')?.score ?? 0
      setTongueScore(score)
      if (status === 'tracking' && detectorRef.current.update(score, now)) {
        clickAt(smoothPointRef.current)
        setLastClick(Date.now())
      }
    }
    frameRef.current = requestAnimationFrame(processFrame)
  }, [status])

  useEffect(() => {
    frameRef.current = requestAnimationFrame(processFrame)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [processFrame])

  useEffect(() => () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop())
    landmarkerRef.current?.close()
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
  }, [status])

  const startCamera = async () => {
    setStatus('loading')
    setMessage('Loading face tracking…')
    try {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm')
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputFaceBlendshapes: true,
        numFaces: 1,
      })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false })
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setStatus('ready')
      setMessage('Camera ready. Sit comfortably, then calibrate.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Could not start the camera.')
    }
  }

  const calibrate = () => {
    samplesRef.current = []
    calibrationIndexRef.current = 0
    setCalibrationIndex(0)
    calibrationStartedRef.current = performance.now()
    setStatus('calibrating')
    setMessage('Keep your head comfortable and look directly at each dot.')
  }

  const toggleTracking = () => {
    if (!modelRef.current) return calibrate()
    setStatus((current) => current === 'tracking' ? 'ready' : 'tracking')
    setMessage(status === 'tracking' ? 'Paused.' : 'Tracking resumed.')
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
        <div><span className="eyebrow">EXPERIMENT 001</span><h1>Look Ma,<br /><em>No Hands.</em></h1></div>
        <div className={`status ${active ? 'live' : ''}`}><span />{status}</div>
      </header>

      <section className="hero-grid">
        <div className="camera-card">
          <video ref={videoRef} muted playsInline />
          {status === 'idle' && <div className="camera-empty">👀</div>}
          <div className="camera-label">LOCAL CAMERA FEED</div>
          <div className="tongue-meter"><span style={{ width: `${Math.min(100, tongueScore * 160)}%` }} /></div>
        </div>

        <div className="control-card">
          <p className="message">{message}</p>
          <div className="steps">
            <div className={status !== 'idle' ? 'done' : ''}><b>1</b><span>Enable camera<small>Your video never leaves this browser.</small></span></div>
            <div className={modelRef.current ? 'done' : ''}><b>2</b><span>Calibrate gaze<small>Follow nine dots with your eyes.</small></span></div>
            <div className={active ? 'done' : ''}><b>3</b><span>Go hands-free<small>Tongue out = click. Esc = pause.</small></span></div>
          </div>
          <div className="actions">
            {status === 'idle' || status === 'error' ? <button className="primary" onClick={startCamera}>Start camera</button> :
              !modelRef.current ? <button className="primary" disabled={status === 'loading' || status === 'calibrating'} onClick={calibrate}>Calibrate</button> :
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
      {target && <div className="calibration-overlay"><div className="calibration-copy">LOOK AT THE DOT <b>{calibrationIndex + 1}/9</b></div><div className="calibration-dot" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} /></div>}
    </main>
  )
}

export default App
