const { Base64Image } = require("../domain/shared/Base64Image");
const { normalizeImageBuffer } = require("../infrastructure/heicConverter");
const { ScreenshotPolicy } = require("../domain/screenshot/ScreenshotPolicy");

// Use case: "bir görsel ekran görüntüsü mü?" akışını yönetir. imageSignalsProvider ve
// screenshotRepository enjekte edilen port'lar — bu sınıf sharp'ı ya da Postgres'i bilmez.
class CheckScreenshotUseCase {
  constructor({ imageSignalsProvider, screenshotRepository }) {
    this.imageSignalsProvider = imageSignalsProvider;
    this.screenshotRepository = screenshotRepository;
  }

  async execute(imageInput) {
    const { buffer: rawBuffer } = new Base64Image(imageInput, "image");
    const buffer = await normalizeImageBuffer(rawBuffer);
    // rawBuffer da ayrıca geçiliyor: HEIC->JPEG dönüşümü EXIF'i sildiği için
    // hasExif sinyali ham buffer'dan okunmalı (bkz. getScreenshotSignals'taki not).
    const signals = await this.imageSignalsProvider(rawBuffer, buffer);
    const isScreenshot = ScreenshotPolicy.decide(signals);

    try {
      await this.screenshotRepository.save(isScreenshot);
    } catch (err) {
      console.error("Ekran görüntüsü kontrolü kaydedilemedi:", err.message);
    }

    return { isScreenshot };
  }
}

module.exports = { CheckScreenshotUseCase };
