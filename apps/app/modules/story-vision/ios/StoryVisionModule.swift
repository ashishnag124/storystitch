import ExpoModulesCore
import ImageIO
import Vision

/// The long side photos are analyzed at: enough to find small faces, and far less memory than the original.
private let analysisLongSide = 1024
/// Below this confidence a detection is ignored, as on web.
private let minimumConfidence: Float = 0.5

public class StoryVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoryVision")

    AsyncFunction("detect") { (uri: String) -> [[String: Any]] in
      guard let image = loadImage(uri) else { return [] }
      return analyze(image)
    }
    .runOnQueue(.global(qos: .userInitiated))
  }
}

/// A downscaled copy of the photo, with its orientation applied.
private func loadImage(_ uri: String) -> CGImage? {
  guard let url = URL(string: uri), let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: analysisLongSide,
  ]
  return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

/// A detection in the shape of the app's `Detection` type. Vision's boxes start at the bottom left; ours at the top left.
private func detection(_ kind: String, _ label: String?, _ score: Float, _ box: CGRect) -> [String: Any] {
  var result: [String: Any] = [
    "kind": kind,
    "score": Double(score),
    "box": ["x": box.minX, "y": 1 - box.maxY, "w": box.width, "h": box.height],
  ]
  if let label { result["label"] = label }
  return result
}

private func analyze(_ image: CGImage) -> [[String: Any]] {
  let faces = VNDetectFaceRectanglesRequest()
  let people = VNDetectHumanRectanglesRequest()
  let animals = VNRecognizeAnimalsRequest()
  let handler = VNImageRequestHandler(cgImage: image)
  // One request failing shouldn't lose the others.
  for request in [faces, people, animals] as [VNRequest] {
    useSimulatorCompute(request)
    do {
      try handler.perform([request])
    } catch {
      NSLog("StoryVision: \(type(of: request)) failed: \(error.localizedDescription)")
    }
  }

  var found: [[String: Any]] = []
  for face in faces.results ?? [] where face.confidence >= minimumConfidence {
    found.append(detection("face", nil, face.confidence, face.boundingBox))
  }
  for person in people.results ?? [] where person.confidence >= minimumConfidence {
    found.append(detection("person", "person", person.confidence, person.boundingBox))
  }
  for animal in animals.results ?? [] where animal.confidence >= minimumConfidence {
    found.append(detection("object", animal.labels.first?.identifier.lowercased(), animal.confidence, animal.boundingBox))
  }
  return found.isEmpty ? salient(handler) : found
}

/// The simulator has no neural hardware, so Vision can't start there unless it's told to use the CPU.
private func useSimulatorCompute(_ request: VNRequest) {
  #if targetEnvironment(simulator)
    request.usesCPUOnly = true
  #endif
}

/// What stands out when nothing was recognized.
private func salient(_ handler: VNImageRequestHandler) -> [[String: Any]] {
  let request = VNGenerateAttentionBasedSaliencyImageRequest()
  useSimulatorCompute(request)
  do {
    try handler.perform([request])
  } catch {
    NSLog("StoryVision: saliency failed: \(error.localizedDescription)")
    return []
  }
  return (request.results?.first?.salientObjects ?? []).prefix(1).map { detection("salient", nil, $0.confidence, $0.boundingBox) }
}
