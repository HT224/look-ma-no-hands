# Look Ma, No Hands

A deliberately silly browser experiment for hands-free interaction:

- Eye tracking controls an in-page cursor.
- Sticking out your tongue clicks.
- Browser speech recognition types into a scratchpad.

All camera processing happens locally in the browser with MediaPipe Face Landmarker. Video is not uploaded or recorded.

Live app: https://look-ma-no-hands.vercel.app

Source: https://github.com/HT224/look-ma-no-hands

## Run it

```bash
npm install
npm run dev
```

Open the local URL in current Chrome or Edge, allow camera access, and calibrate while sitting naturally. Voice recognition support varies by browser and may use the browser vendor's speech service.

## Limits

This MVP controls only the virtual cursor inside its own webpage. Moving the real macOS pointer requires a native companion with Accessibility permission. Tongue detection and gaze accuracy depend heavily on lighting, camera angle, glasses, and calibration quality.
