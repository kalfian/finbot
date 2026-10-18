import AppKit
import PDFKit

let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
let selectedPage = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3])! : 0
guard let document = PDFDocument(url: URL(fileURLWithPath: input)),
      let page = document.page(at: selectedPage) else {
  fatalError("Cannot open PDF")
}
let text = (0..<document.pageCount).compactMap { document.page(at: $0)?.string }.joined(separator: "\n")
for index in 0..<document.pageCount {
  let pageText = document.page(at: index)?.string ?? ""
  print("Page \(index + 1): \((pageText.components(separatedBy: "Transport receipt").count - 1)) rows")
}
guard !text.isEmpty, document.pageCount > 0 else { fatalError("PDF content is incomplete") }
let bounds = page.bounds(for: .mediaBox)
let image = NSImage(size: NSSize(width: bounds.width * 2, height: bounds.height * 2))
image.lockFocus()
NSColor.white.setFill()
NSRect(origin: .zero, size: image.size).fill()
if let context = NSGraphicsContext.current?.cgContext {
  context.saveGState()
  context.scaleBy(x: 2, y: 2)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()
}
image.unlockFocus()
guard let data = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: data),
      let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Cannot render PDF")
}
try png.write(to: URL(fileURLWithPath: output))
print("Pages: \(document.pageCount), selected text: \(text.count) characters, first page: \(Int(bounds.width)) x \(Int(bounds.height))")
