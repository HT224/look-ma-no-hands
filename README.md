# Look Ma, No Hands

A deliberately silly browser experiment for hands-free interaction:

- Index-finger tracking controls an in-page cursor.
- Sticking out your tongue clicks.
- Browser speech recognition types into a scratchpad.

Finger and tongue tracking are powered by MediaPipe Hand Landmarker and Face Landmarker. All camera processing happens locally in the browser; video is not uploaded or recorded.

Live app: https://look-ma-no-hands.vercel.app

Source: https://github.com/HT224/look-ma-no-hands

## Run it

```bash
npm install
npm run dev
```

Open the local URL in current Chrome or Edge, allow camera access, and point your index finger at the camera. No calibration is required. Voice recognition support varies by browser and may use the browser vendor's speech service.

## Limits

This MVP controls only the virtual cursor inside its own webpage. Moving the real macOS pointer requires a native companion with Accessibility permission. Finger accuracy still depends on lighting, camera angle, and keeping the fingertip visible.

## Open-source attribution

- [MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache-2.0 License.
