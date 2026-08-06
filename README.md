# Look Ma, No Hands

A deliberately silly browser experiment for hands-free interaction:

- Eye tracking controls an in-page cursor.
- Sticking out your tongue clicks.
- Browser speech recognition types into a scratchpad.

Eye tracking is powered by [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack), an MIT-licensed, head-pose-aware neural gaze estimator with on-device personalization and Kalman filtering. Tongue detection uses the face blendshapes already produced by its MediaPipe pipeline. All camera processing happens locally in the browser; video is not uploaded or recorded.

Live app: https://look-ma-no-hands.vercel.app

Source: https://github.com/HT224/look-ma-no-hands

## Run it

```bash
npm install
npm run dev
```

Open the local URL in current Chrome or Edge, allow camera access, and calibrate while sitting naturally. Look directly at each of the nine dots while WebEyeTrack captures its personalization sample. Voice recognition support varies by browser and may use the browser vendor's speech service.

## Limits

This MVP controls only the virtual cursor inside its own webpage. Moving the real macOS pointer requires a native companion with Accessibility permission. Webcam gaze accuracy still depends on lighting, camera angle, glasses, and calibration quality.

## Open-source attribution

- [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack), MIT License, © its contributors.
- [MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache-2.0 License.
- [TensorFlow.js](https://github.com/tensorflow/tfjs), Apache-2.0 License.
