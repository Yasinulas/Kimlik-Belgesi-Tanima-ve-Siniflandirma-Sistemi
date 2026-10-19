// Aggregate root: bir analiz isteğinin tüm sonucunu (tespitler + en iyi tahmin + geçerlilik) temsil eder.
class DocumentAnalysis {
  constructor(detections) {
    this.status = "success";
    this.detections = [...detections].sort((a, b) => b.confidence - a.confidence);
    this.top = this.detections[0] || null;
    this.isValidDocument = Boolean(this.top) && this.top.className !== "none_valid";
    this.createdAt = new Date();
  }

  toResult() {
    return {
      status: this.status,
      isValidDocument: this.isValidDocument,
      topPrediction: this.top && {
        documentType: this.top.className,
        label: this.top.label,
        confidence: this.top.confidence,
        documentCategory: this.top.documentCategory,
        ...(Object.prototype.hasOwnProperty.call(this.top, "side") ? { side: this.top.side } : {}),
      },
      totalDetections: this.detections.length,
      detections: this.detections,
      createdAt: this.createdAt,
    };
  }
}

module.exports = { DocumentAnalysis };
