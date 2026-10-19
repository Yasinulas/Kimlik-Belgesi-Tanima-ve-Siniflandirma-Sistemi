// Port (arayüz): gerçek implementasyon infrastructure/db/PostgresPhotocopyRepository.js'te.
class PhotocopyCheckRepository {
  async save(_isPhotocopy) {
    throw new Error("PhotocopyCheckRepository.save() implemente edilmeli");
  }
}

module.exports = { PhotocopyCheckRepository };
