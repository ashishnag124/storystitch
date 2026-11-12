// The model call behind "Describe a layout". It imports nothing from Expo, so apps/app/scripts/eval-describe.mjs can
// compile this same file into a small command line tool and measure the real model on the evaluation set.
#if canImport(FoundationModels)
  import FoundationModels

  /// Why a request failed; the raw value is the code the app is given.
  enum StoryAIFailure: String, Error {
    case unavailable
    case refused
    case failed
  }

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
  func generateSpec(_ prompt: String, temperature: Double) async throws -> String {
    guard SystemLanguageModel.default.isAvailable else { throw StoryAIFailure.unavailable }
    do {
      let session = LanguageModelSession()
      // The app asks several times at different temperatures to offer different layouts.
      let response = try await session.respond(to: prompt, generating: Spec.self, options: GenerationOptions(temperature: temperature))
      return response.content.generatedContent.jsonString
    } catch {
      throw errorCode(error)
    }
  }

  /// What the app is told about an error from the model. Newer systems throw LanguageModelError, older ones GenerationError.
  @available(iOS 26.0, *)
  private func errorCode(_ error: Error) -> StoryAIFailure {
    // LanguageModelError exists only in the iOS 27 SDK (Swift 6.4, Xcode 27). #available can't hide a type the SDK
    // doesn't declare, so on Xcode 26 this is left out at compile time and GenerationError below covers every iOS.
    #if compiler(>=6.4)
      if #available(iOS 27.0, *), let error = error as? LanguageModelError {
        switch error {
        case .guardrailViolation, .refusal, .unsupportedLanguageOrLocale: return .refused
        default: return .failed
        }
      }
    #endif
    if let error = error as? LanguageModelSession.GenerationError {
      switch error {
      case .guardrailViolation, .refusal, .unsupportedLanguageOrLocale: return .refused
      case .assetsUnavailable: return .unavailable
      default: return .failed
      }
    }
    return .failed
  }
#endif
