const MAX_MB = 10;

// Value object: base64 girdisini doğrular, gerçek byte buffer'a çevirir.
// Hem AnalyzeDocumentUseCase hem CheckPhotocopyUseCase aynı kuralı kullanır — tekrar etmez.
class Base64Image {
  constructor(input, fieldName = "image") {
    if (typeof input !== "string" || input.length === 0) {
      throw { status: 400, code: "INVALID_IMAGE", message: `${fieldName} alanı zorunlu.` };
    }

    const clean = input.replace(/^data:image\/\w+;base64,/, "");
    const sizeMb = (clean.length * 3) / 4 / 1024 / 1024;
    if (sizeMb > MAX_MB) {
      throw { status: 413, code: "IMAGE_TOO_LARGE", message: `${fieldName} en fazla ${MAX_MB} MB olabilir.` };
    }

    this.buffer = Buffer.from(clean, "base64");
  }
}

module.exports = { Base64Image, MAX_MB };
