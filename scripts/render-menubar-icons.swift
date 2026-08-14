import AppKit
import Foundation

func render(unread: Bool, url: URL) {
  let size = NSSize(width: 22, height: 22)
  let config = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
  guard let symbol = NSImage(systemSymbolName: "person.2", accessibilityDescription: nil)?
    .withSymbolConfiguration(config) else { FileHandle.standardError.write(Data("missing person.2\n".utf8)); exit(1) }
  let canvas = NSImage(size: size)
  canvas.lockFocus()
  NSColor.clear.setFill()
  NSRect(origin: .zero, size: size).fill()
  let s = symbol.size
  let origin = NSPoint(
    x: ((22 - s.width) / 2).rounded(.down),
    y: ((22 - s.height) / 2).rounded(.down)
  )
  symbol.draw(in: NSRect(origin: origin, size: s), from: .zero, operation: .sourceOver, fraction: 1)
  if unread {
    NSColor.black.setFill()
    NSBezierPath(ovalIn: NSRect(x: 16, y: 2, width: 6, height: 6)).fill()
  }
  canvas.unlockFocus()
  guard let tiff = canvas.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
  try! png.write(to: url)
}

if CommandLine.arguments.count < 2 { exit(1) }
let outDir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
render(unread: false, url: outDir.appendingPathComponent("menubarTemplate.png"))
render(unread: true, url: outDir.appendingPathComponent("menubar-unreadTemplate.png"))
