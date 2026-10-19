const { Base64Image } = require("../domain/shared/Base64Image");
const { normalizeImageBuffer } = require("../infrastructure/heicConverter");
const { PhotocopyPolicy } = require("../domain/photocopy/PhotocopyPolicy");

// Use case: "bir görsel fotokopi mi?" akışını yönetir. imageStatsProvider ve
// photocopyRepository enjekte edilen port'lar — bu sınıf sharp'ı ya da Postgres'i bilmez.
class CheckPhotocopyUseCase {
  constructor({ imageStatsProvider, photocopyRepository }) {
    this.imageStatsProvider = imageStatsProvider;
    this.photocopyRepository = photocopyRepository;
  }

  async execute(imageInput) {
    const { buffer: rawBuffer } = new Base64Image(imageInput, "image");
    const buffer = await normalizeImageBuffer(rawBuffer);
    const channelStats = await this.imageStatsProvider(buffer);
    const isPhotocopy = PhotocopyPolicy.decide(channelStats);

    try {
      await this.photocopyRepository.save(isPhotocopy);
    } catch (err) {
      console.error("Fotokopi kontrolü kaydedilemedi:", err.message);
    }

    return { isPhotocopy };
  }
}

module.exports = { CheckPhotocopyUseCase };
