// App Store Connect rejects images with an alpha channel, and `simctl io screenshot` writes one.
// Usage: swift flatten.swift in.png out.png   Redraws the image on opaque RGB, keeping its size and color profile.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3,
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
  let space = image.colorSpace,
  let context = CGContext(
    data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { fatalError("Usage: swift flatten.swift in.png out.png") }

let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
context.setFillColor(CGColor(gray: 0, alpha: 1))
context.fill(bounds)
context.draw(image, in: bounds)

guard let flat = context.makeImage(),
  let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("Couldn't write \(args[2])") }
CGImageDestinationAddImage(out, flat, nil)
guard CGImageDestinationFinalize(out) else { fatalError("Couldn't write \(args[2])") }
