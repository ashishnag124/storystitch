# Detection models

Served from this origin so photos are analyzed without contacting any third party.

| File | Model | Source | License |
|---|---|---|---|
| `blaze_face_full_range.tflite` | BlazeFace full-range (float16) | [MediaPipe Face Detector](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector) | Apache-2.0 |
| `efficientdet_lite0.tflite` | EfficientDet-Lite0 (int8, COCO) | [MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector) | Apache-2.0 |

Downloaded from `https://storage.googleapis.com/mediapipe-models/` (`…/latest/`) on 2026-10-31.
The MediaPipe WebAssembly runtime is copied from `@mediapipe/tasks-vision` at build time (`scripts/copy-mediapipe.mjs`).
