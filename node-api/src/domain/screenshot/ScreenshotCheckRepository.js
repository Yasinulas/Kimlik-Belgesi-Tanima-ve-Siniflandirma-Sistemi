// Port (arayüz): gerçek implementasyon infrastructure/db/PostgresScreenshotRepository.js'te.
class ScreenshotCheckRepository {
  async save(_isScreenshot) {
    throw new Error("ScreenshotCheckRepository.save() implemente edilmeli");
  }
}

module.exports = { ScreenshotCheckRepository };
