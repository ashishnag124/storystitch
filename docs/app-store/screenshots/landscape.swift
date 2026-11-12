// Builds the wide App Store images from real captures in this folder, on the app's colors (see README):
// - the landscape image that leads the 6.5-inch iPhone set, which Messages uses for App Store link previews
// - the product page header and the search results image, shown on iOS 27 and later
// Usage, from the repo root: swiftc -O docs/app-store/screenshots/landscape.swift -o /tmp/landscape && /tmp/landscape
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let dir = "docs/app-store/screenshots/"
let captureRatio: CGFloat = 1320.0 / 2868.0

func load(_ path: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(src, 0, nil)
  else { fatalError("Couldn't read \(path)") }
  return image
}
func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(
    srgbRed: CGFloat(hex >> 16 & 0xff) / 255, green: CGFloat(hex >> 8 & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255,
    alpha: alpha)
}
// Colors from apps/app/src/theme.ts
let background = color(0x2b1340), text = color(0xfff4e8), accent = color(0xffc24b)

// Bricolage Grotesque is a variable font: pick its weight with the wght axis.
let fontURL = URL(fileURLWithPath: "apps/app/assets/fonts/BricolageGrotesque.ttf") as CFURL
guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontURL) as? [CTFontDescriptor], let base = descriptors.first
else { fatalError("Couldn't load the font") }
func font(_ size: CGFloat, weight: Int) -> CTFont {
  let wght = 0x7767_6874  // 'wght'
  let d = CTFontDescriptorCreateCopyWithAttributes(
    base, [kCTFontVariationAttribute: [wght: weight]] as CFDictionary)
  return CTFontCreateWithFontDescriptor(d, size, nil)
}
// One line of text, in one or more colored runs.
func line(_ runs: [(String, CGColor)], _ font: CTFont) -> CTLine {
  let s = NSMutableAttributedString()
  for (string, fill) in runs {
    s.append(
      NSAttributedString(string: string, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): fill,
      ]))
  }
  return CTLineCreateWithAttributedString(s)
}
func line(_ string: String, _ font: CTFont, _ fill: CGColor) -> CTLine { line([(string, fill)], font) }
func lineWidth(_ l: CTLine) -> CGFloat { CGFloat(CTLineGetTypographicBounds(l, nil, nil, nil)) }

let space = CGColorSpace(name: CGColorSpace.displayP3)!

// An opaque canvas in the app's purple, with a soft warm glow centered at `glow` (fractions of the canvas).
func canvas(_ width: Int, _ height: Int, glow: CGPoint, glowRadius: CGFloat) -> CGContext {
  guard
    let ctx = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
  else { fatalError("Couldn't make a context") }
  let W = CGFloat(width), H = CGFloat(height)
  ctx.setFillColor(background)
  ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  let gradient = CGGradient(
    colorsSpace: space, colors: [color(0xff7a59, 0.35), color(0x2b1340, 0)] as CFArray, locations: [0, 1])!
  let center = CGPoint(x: W * glow.x, y: H * glow.y)
  ctx.drawRadialGradient(
    gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: glowRadius, options: [])
  return ctx
}

// Phones in a row starting at x, each centered on centerY. Corner radius matches the device's.
func phones(_ ctx: CGContext, _ shots: [(String, CGFloat)], x startX: CGFloat, centerY: CGFloat, gap: CGFloat) {
  var x = startX
  for (name, h) in shots {
    let w = h * captureRatio
    let rect = CGRect(x: x, y: centerY - h / 2, width: w, height: h)
    let path = CGPath(roundedRect: rect, cornerWidth: w * 0.128, cornerHeight: w * 0.128, transform: nil)
    let scale = max(1, h / 1150)  // Shadow and outline were tuned at 1150 pixels or less: grow them for bigger phones
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -24 * scale), blur: 70 * scale, color: color(0x000000, 0.55))
    ctx.addPath(path)
    ctx.setFillColor(background)
    ctx.fillPath()
    ctx.restoreGState()
    ctx.saveGState()
    ctx.addPath(path)
    ctx.clip()
    ctx.draw(load(dir + name), in: rect)
    ctx.restoreGState()
    ctx.addPath(path)
    ctx.setStrokeColor(color(0xffffff, 0.14))
    ctx.setLineWidth(3 * scale)
    ctx.strokePath()
    x += w + gap
  }
}
func rowWidth(_ shots: [(String, CGFloat)], gap: CGFloat) -> CGFloat {
  shots.reduce(0) { $0 + $1.1 * captureRatio } + gap * CGFloat(shots.count - 1)
}

func write(_ ctx: CGContext, _ output: String) {
  try? FileManager.default.createDirectory(
    atPath: (output as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
  let jpeg = output.hasSuffix(".jpg")
  guard let image = ctx.makeImage(),
    let out = CGImageDestinationCreateWithURL(
      URL(fileURLWithPath: output) as CFURL, (jpeg ? UTType.jpeg : UTType.png).identifier as CFString, 1, nil)
  else { fatalError("Couldn't write \(output)") }
  CGImageDestinationAddImage(out, image, jpeg ? [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary : nil)
  guard CGImageDestinationFinalize(out) else { fatalError("Couldn't write \(output)") }
  print("Wrote \(output) (\(ctx.width) × \(ctx.height))")
}

// The 6.5-inch set's first image, 2778 × 1284: three phones on the right, the home screen's headline on the left.
func cover() {
  let W: CGFloat = 2778, H: CGFloat = 1284
  let ctx = canvas(Int(W), Int(H), glow: CGPoint(x: 0.69, y: 0.5), glowRadius: H * 0.95)
  let shots: [(String, CGFloat)] = [("02-polaroids.png", 1030), ("03-mosaic.png", 1150), ("07-layout-editor.png", 1030)]
  let gap: CGFloat = 52
  let blockStart = W - 120 - rowWidth(shots, gap: gap)
  phones(ctx, shots, x: blockStart, centerY: H / 2, gap: gap)

  // Icon and name, then the headline, sized to fit the space left of the phones.
  let left: CGFloat = 150, maxText = blockStart - left - 110
  var size: CGFloat = 150
  var l1 = line("Up to 8 photos.", font(size, weight: 750), text)
  var l2 = line("One story.", font(size, weight: 750), accent)
  while max(lineWidth(l1), lineWidth(l2)) > maxText {
    size -= 2
    l1 = line("Up to 8 photos.", font(size, weight: 750), text)
    l2 = line("One story.", font(size, weight: 750), accent)
  }
  let sub = line("Pick your photos and a layout, then share.", font(size * 0.34, weight: 450), color(0xfff4e8, 0.78))
  let name = line("StoryStitch", font(64, weight: 700), text)
  let iconSize: CGFloat = 112
  let leading = size * 1.08
  let blockH = iconSize + 90 + leading * 2 + 40 + size * 0.34
  var top = (H + blockH) / 2  // CG's y grows upward

  let iconRect = CGRect(x: left, y: top - iconSize, width: iconSize, height: iconSize)
  ctx.saveGState()
  ctx.addPath(CGPath(roundedRect: iconRect, cornerWidth: iconSize * 0.225, cornerHeight: iconSize * 0.225, transform: nil))
  ctx.clip()
  ctx.draw(load("apps/app/assets/icon.png"), in: iconRect)
  ctx.restoreGState()
  ctx.textPosition = CGPoint(x: left + iconSize + 32, y: top - iconSize / 2 - 22)
  CTLineDraw(name, ctx)
  top -= iconSize + 90

  top -= size * 0.8
  ctx.textPosition = CGPoint(x: left - size * 0.04, y: top)
  CTLineDraw(l1, ctx)
  top -= leading
  ctx.textPosition = CGPoint(x: left - size * 0.04, y: top)
  CTLineDraw(l2, ctx)
  top -= 40 + size * 0.34 + size * 0.2
  ctx.textPosition = CGPoint(x: left, y: top)
  CTLineDraw(sub, ctx)
  write(ctx, "docs/app-store/screenshots-6.5/01-collages.png")
}

// The product page header, 21:9 at 3840 × 1646. One idea, no text (the App Store shows the name):
// five real collages, the largest in the middle, kept inside the center of the frame.
func header() {
  let W: CGFloat = 3840, H: CGFloat = 1646
  let ctx = canvas(Int(W), Int(H), glow: CGPoint(x: 0.5, y: 0.5), glowRadius: W * 0.42)
  let shots: [(String, CGFloat)] = [
    ("05-heart.png", 1080), ("02-polaroids.png", 1200), ("03-mosaic.png", 1330),
    ("07-layout-editor.png", 1200), ("04-circles.png", 1080),
  ]
  let gap: CGFloat = 64
  phones(ctx, shots, x: (W - rowWidth(shots, gap: gap)) / 2, centerY: H / 2, gap: gap)
  write(ctx, "docs/app-store/creative/header.jpg")
}

// The search results image, 3:2 at 3840 × 2560. States what the app does in one line, then shows it.
func search() {
  let W: CGFloat = 3840, H: CGFloat = 2560
  let ctx = canvas(Int(W), Int(H), glow: CGPoint(x: 0.5, y: 0.42), glowRadius: W * 0.5)
  let size: CGFloat = 230
  let headline = line([("Up to 8 photos. ", text), ("One story.", accent)], font(size, weight: 750))
  ctx.textPosition = CGPoint(x: (W - lineWidth(headline)) / 2, y: H - 200 - size * 0.8)
  CTLineDraw(headline, ctx)
  let shots: [(String, CGFloat)] = [("02-polaroids.png", 1800), ("03-mosaic.png", 1800), ("07-layout-editor.png", 1800)]
  let gap: CGFloat = 110
  let top = H - 200 - size - 150
  phones(ctx, shots, x: (W - rowWidth(shots, gap: gap)) / 2, centerY: top - 1800 / 2, gap: gap)
  write(ctx, "docs/app-store/creative/search-results.jpg")
}

cover()
header()
search()
