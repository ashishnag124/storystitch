import ExpoModulesCore
#if canImport(FoundationModels)
  import FoundationModels
#endif

/// Describe a layout runs Apple's on-device language model, so nothing leaves the phone. The framework needs iOS 26,
/// but the app still runs on older versions: there, `availability` says "unsupported" and `generate` is never called.

/// An error the app can tell apart by its code: `unavailable`, `refused` or `failed`.
private final class StoryAIException: Exception, @unchecked Sendable {
  private let kind: String
  init(_ kind: String) {
    self.kind = kind
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
          return try await generateSpec(prompt)
        }
      #endif
      throw StoryAIException("unavailable")
    }
  }
}

#if canImport(FoundationModels)
  // These mirror LayoutSpec in packages/shared/src/describe.ts. Guided generation makes the model's answer fit this
  // shape, so only the total number of photos is left for the app to check.

  @available(iOS 26.0, *)
  @Generable(description: "A row or column of photos in a collage")
  struct SpecBand {
    @Guide(description: "How many photos this band holds", .range(1...4))
    var photos: Int
    @Guide(description: "Its share of the collage compared with the other bands, 1 (small) to 10 (large)", .range(1...10))
    var size: Int
  }

  @available(iOS 26.0, *)
  @Generable(description: "A collage layout as bands of photos")
  struct Spec {
    @Guide(description: "rows if the bands are stacked top to bottom, columns if they sit side by side", .anyOf(["rows", "columns"]))
    var direction: String
    @Guide(description: "The bands in order, from top to bottom for rows or from left to right for columns", .count(1...8))
    var bands: [SpecBand]
  }

  /// The model's answer as JSON text in the shape of LayoutSpec.
  @available(iOS 26.0, *)
  private func generateSpec(_ prompt: String) async throws -> String {
    guard SystemLanguageModel.default.isAvailable else { throw StoryAIException("unavailable") }
    do {
      let session = LanguageModelSession()
      // A low temperature: a layout should follow the description, not be a surprise.
      let response = try await session.respond(to: prompt, generating: Spec.self, options: GenerationOptions(temperature: 0.2))
      return response.content.generatedContent.jsonString
    } catch {
      throw StoryAIException(errorCode(error))
    }
  }

  /// What the app is told about an error from the model. Newer systems throw LanguageModelError, older ones GenerationError.
  @available(iOS 26.0, *)
  private func errorCode(_ error: Error) -> String {
    if #available(iOS 27.0, *), let error = error as? LanguageModelError {
      switch error {
      case .guardrailViolation, .refusal, .unsupportedLanguageOrLocale: return "refused"
      default: return "failed"
      }
    }
    if let error = error as? LanguageModelSession.GenerationError {
      switch error {
      case .guardrailViolation, .refusal, .unsupportedLanguageOrLocale: return "refused"
      case .assetsUnavailable: return "unavailable"
      default: return "failed"
      }
    }
    return "failed"
  }
#endif
