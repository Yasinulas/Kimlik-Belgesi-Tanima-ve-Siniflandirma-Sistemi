const { Base64Image } = require("../domain/shared/Base64Image");
const { normalizeImageBuffer } = require("../infrastructure/heicConverter");
const { ValueError } = require("../domain/shared/ValueError");
const { Detection } = require("../domain/documentAnalysis/Detection");
const { DocumentAnalysis } = require("../domain/documentAnalysis/DocumentAnalysis");

// Use case: "bir görseli analiz et" akışını yönetir. Sadece domain kavramlarını
// ve enjekte edilen port'ları (detector, analysisRepository) bilir — ONNX'i ya da
// Postgres'i doğrudan tanımaz, bu yüzden sahte implementasyonlarla test edilebilir.
class AnalyzeDocumentUseCase {
  constructor({ detector, analysisRepository }) {
    this.detector = detector;
    this.analysisRepository = analysisRepository;
  }

  async execute(imageInput, conf = 0.25) {
    const { buffer: rawBuffer } = new Base64Image(imageInput, "image");
    const buffer = await normalizeImageBuffer(rawBuffer);

    let rawDetections;
    try {
      rawDetections = await this.detector.detect(buffer, conf);
    } catch (err) {
      if (err instanceof ValueError) {
        throw { status: 400, code: "INVALID_IMAGE", message: err.message };
      }
      throw { status: 500, code: "MODEL_ERROR", message: "Analiz sırasında beklenmeyen bir hata oluştu." };
    }

    const detections = rawDetections.map((raw) => new Detection(raw));
    const analysis = new DocumentAnalysis(detections);

    try {
      await this.analysisRepository.save(analysis);
    } catch (err) {
      console.error("Analiz kaydedilemedi:", err.message);
    }

    return analysis.toResult();
  }
}

module.exports = { AnalyzeDocumentUseCase };
