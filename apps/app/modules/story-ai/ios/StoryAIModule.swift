import ExpoModulesCore
#if canImport(FoundationModels)
  import FoundationModels
#endif

/// Describe a layout runs Apple's on-device language model, so nothing leaves the phone. The framework needs iOS 26,
/// but the app still runs on older versions: there, `availability` says "unsupported" and `generate` is never called.
/// The model call itself is in StoryAIGeneration.swift.

/// An error the app can tell apart by its code: `unavailable`, `refused` or `failed`.
private final class StoryAIException: Exception, @unchecked Sendable {
  init(_ kind: String) {
    super.init(name: "StoryAIException", description: kind, code: kind)
  }
}

public class StoryAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoryAI")

    AsyncFunction("availability") { () -> String in
      #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
          switch SystemLanguageModel.default.availability {
          case .available:
            return "available"
          case .unavailable(.deviceNotEligible):
            return "unsupported"
          case .unavailable:
            // Apple Intelligence is off, or the model is still downloading.
            return "notReady"
          }
        }
      #endif
      return "unsupported"
    }

    AsyncFunction("generate") { (prompt: String) async throws -> String in
      #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
          do {
            return try await generateSpec(prompt)
          } catch let failure as StoryAIFailure {
            throw StoryAIException(failure.rawValue)
          }
        }
      #endif
      throw StoryAIException("unavailable")
    }
  }
}
