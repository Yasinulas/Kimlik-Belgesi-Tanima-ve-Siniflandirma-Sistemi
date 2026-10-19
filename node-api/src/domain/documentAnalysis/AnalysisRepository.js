// Port (arayüz): domain, analizlerin nasıl saklandığını bilmez — sadece bu sözleşmeyi bilir.
// Gerçek implementasyon infrastructure/db/PostgresAnalysisRepository.js'te.
class AnalysisRepository {
  async save(_analysis) {
    throw new Error("AnalysisRepository.save() implemente edilmeli");
  }

  async findRecent(_limit) {
    throw new Error("AnalysisRepository.findRecent() implemente edilmeli");
  }
}

module.exports = { AnalysisRepository };
