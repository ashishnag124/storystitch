// Builds the landscape image that leads the 6.5-inch iPhone set: three real captures from this folder,
// side by side, with the app's own headline. Messages uses this image for App Store link previews (see README).
// Usage, from the repo root: swiftc -O docs/app-store/screenshots/landscape.swift -o /tmp/landscape && /tmp/landscape
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let dir = "docs/app-store/screenshots/"
let width = 2778, height = 1284  // An accepted 6.5-inch landscape size
let shots = ["02-polaroids.png", "03-mosaic.png", "07-layout-editor.png"]
let output = "docs/app-store/screenshots-6.5/01-collages.png"

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
func line(_ string: String, _ font: CTFont, _ fill: CGColor) -> CTLine {
  CTLineCreateWithAttributedString(
    NSAttributedString(string: string, attributes: [
      NSAttributedString.Key(kCTFontAttributeName as String): font,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): fill,
    ]))
}
func lineWidth(_ l: CTLine) -> CGFloat { CGFloat(CTLineGetTypographicBounds(l, nil, nil, nil)) }

let space = CGColorSpace(name: CGColorSpace.displayP3)!
guard
  let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { fatalError("Couldn't make a context") }
let W = CGFloat(width), H = CGFloat(height)

// Background, with a soft warm glow behind the phones.
ctx.setFillColor(background)
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
let glow = CGGradient(
  colorsSpace: space, colors: [color(0xff7a59, 0.35), color(0x2b1340, 0)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(
  glow, startCenter: CGPoint(x: W * 0.69, y: H * 0.5), startRadius: 0, endCenter: CGPoint(x: W * 0.69, y: H * 0.5),
  endRadius: H * 0.95, options: [])

// Phones: the middle one larger, all centered vertically. Corner radius matches the device's.
let sideH: CGFloat = 1030, midH: CGFloat = 1150, gap: CGFloat = 52, rightMargin: CGFloat = 120
let ratio = 1320.0 / 2868.0
let sideW = sideH * ratio, midW = midH * ratio
var x = W - rightMargin - (sideW * 2 + midW + gap * 2)
let blockStart = x
for (i, name) in shots.enumerated() {
  let h = i == 1 ? midH : sideH, w = h * ratio
  let rect = CGRect(x: x, y: (H - h) / 2, width: w, height: h)
  let path = CGPath(roundedRect: rect, cornerWidth: w * 0.128, cornerHeight: w * 0.128, transform: nil)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -24), blur: 70, color: color(0x000000, 0.55))
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
  ctx.setLineWidth(3)
  ctx.strokePath()
  x += w + gap
}

// Text: icon and name, then the headline from the home screen, sized to fit the space left of the phones.
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

let icon = load("apps/app/assets/icon.png")
let iconRect = CGRect(x: left, y: top - iconSize, width: iconSize, height: iconSize)
ctx.saveGState()
ctx.addPath(CGPath(roundedRect: iconRect, cornerWidth: iconSize * 0.225, cornerHeight: iconSize * 0.225, transform: nil))
ctx.clip()
ctx.draw(icon, in: iconRect)
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

try? FileManager.default.createDirectory(atPath: "docs/app-store/screenshots-6.5", withIntermediateDirectories: true)
guard let image = ctx.makeImage(),
  let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("Couldn't write \(output)") }
CGImageDestinationAddImage(out, image, nil)
guard CGImageDestinationFinalize(out) else { fatalError("Couldn't write \(output)") }
print("Wrote \(output), headline at \(Int(size)) pt")
