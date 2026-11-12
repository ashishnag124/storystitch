// Command line front end for the evaluation: prints the model's answer to the prompt given as the first argument,
// from the same generateSpec the app uses. Built and run in the simulator by ../eval-describe.mjs. Never part of the app.
import FoundationModels

if #available(iOS 26.0, *) {
  do {
    print(try await generateSpec(CommandLine.arguments[1]))
  } catch {
    print("ERROR: \(error)")
  }
}
