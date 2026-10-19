// Port (arayüz): domain, tespitlerin ONNX ile mi başka bir modelle mi yapıldığını bilmez.
// Gerçek implementasyon infrastructure/onnx/OnnxDetector.js'te.
class DocumentDetector {
  async detect(_imageBytes, _conf) {
    throw new Error("DocumentDetector.detect() implemente edilmeli");
  }
}

module.exports = { DocumentDetector };
