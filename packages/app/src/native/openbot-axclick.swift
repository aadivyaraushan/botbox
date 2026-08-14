
import AppKit
import ApplicationServices
import Foundation

struct Request: Decodable {
  var pid: Int32?
  var titles: [String]
}

struct Response: Encodable {
  var ok: Bool
  var error: String?
}

func emit(_ response: Response, code: Int32) -> Never {
  let data = try! JSONEncoder().encode(response)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
  exit(code)
}

func readRequest() -> Request {
  if CommandLine.arguments.count > 1 {
    let raw = CommandLine.arguments[1]
    guard let data = raw.data(using: .utf8),
          let req = try? JSONDecoder().decode(Request.self, from: data) else {
      emit(Response(ok: false, error: "bad-argv"), code: 1)
    }
    return req
  }
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard let req = try? JSONDecoder().decode(Request.self, from: data) else {
    emit(Response(ok: false, error: "bad-stdin"), code: 1)
  }
  return req
}

func chromePid(preferred: Int32?) -> pid_t? {
  if let preferred { return preferred }
  let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome")
  return apps.first?.processIdentifier
}

func titleMatches(_ value: String?, titles: [String]) -> Bool {
  guard let value else { return false }
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  return titles.contains { $0.caseInsensitiveCompare(trimmed) == .orderedSame }
}

func walk(_ el: AXUIElement, titles: [String]) -> AXUIElement? {
  var role: CFTypeRef?
  AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
  let roleStr = role as? String
  if roleStr == (kAXButtonRole as String) {
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &title)
    if titleMatches(title as? String, titles: titles) { return el }
  }
  var children: CFTypeRef?
  let err = AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children)
  guard err == .success, let arr = children as? [AXUIElement] else { return nil }
  for child in arr {
    if let hit = walk(child, titles: titles) { return hit }
  }
  return nil
}

func clickCenter(_ el: AXUIElement) -> Bool {
  var pos: CFTypeRef?
  var size: CFTypeRef?
  guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
        AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else {
    return false
  }
  var point = CGPoint.zero
  var rectSize = CGSize.zero
  AXValueGetValue(pos as! AXValue, .cgPoint, &point)
  AXValueGetValue(size as! AXValue, .cgSize, &rectSize)
  let x = point.x + rectSize.width / 2
  let y = point.y + rectSize.height / 2
  guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                           mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                         mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left) else {
    return false
  }
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  return true
}

let req = readRequest()
if !AXIsProcessTrusted() {
  emit(Response(ok: false, error: "accessibility-denied"), code: 1)
}
guard let pid = chromePid(preferred: req.pid) else {
  emit(Response(ok: false, error: "chrome-not-found"), code: 1)
}
let app = AXUIElementCreateApplication(pid)
guard let button = walk(app, titles: req.titles.isEmpty
      ? ["Allow", "Continue", "Authorize", "Approve"]
      : req.titles) else {
  emit(Response(ok: false, error: "button-not-found"), code: 1)
}
guard clickCenter(button) else {
  emit(Response(ok: false, error: "click-failed"), code: 1)
}
emit(Response(ok: true, error: nil), code: 0)
