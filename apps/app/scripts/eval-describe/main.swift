// Command line front end for the evaluation: prints how long the model took (in milliseconds) and then its answer to
// the prompt given as the first argument, at the temperature given as the second, from the same generateSpec the app
// uses. Built and run in the simulator by ../eval-describe.mjs. Never part of the app.
import Foundation
import FoundationModels

if #available(iOS 26.0, *) {
  let started = Date()
  do {
    let answer = try await generateSpec(CommandLine.arguments[1], temperature: Double(CommandLine.arguments[2]) ?? 0.2)
    print("TIME \(Int(Date().timeIntervalSince(started) * 1000))")
    print(answer)
  } catch {
    print("TIME \(Int(Date().timeIntervalSince(started) * 1000))")
    print("ERROR: \(error)")
  }
}
