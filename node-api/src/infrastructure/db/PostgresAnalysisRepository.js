const { AnalysisRepository } = require("../../domain/documentAnalysis/AnalysisRepository");
const { getPool } = require("./connection");

class PostgresAnalysisRepository extends AnalysisRepository {
  async save(analysis) {
    const top = analysis.top;
    await getPool().query(
      `INSERT INTO analyses
         (status, is_valid_document, document_type, label, document_category, side, confidence, total_detections, detections, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        analysis.status,
        analysis.isValidDocument,
        top ? top.className : null,
        top ? top.label : null,
        top ? top.documentCategory : null,
        top ? (top.side ?? null) : null,
        top ? top.confidence : null,
        analysis.detections.length,
        JSON.stringify(analysis.detections),
        analysis.createdAt,
      ]
    );
  }

  async findRecent(limit) {
    const { rows } = await getPool().query(
      `SELECT status, is_valid_document, document_type, label, document_category, side,
              confidence, total_detections, detections, created_at
       FROM analyses
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }
}

const postgresAnalysisRepository = new PostgresAnalysisRepository();

module.exports = { PostgresAnalysisRepository, postgresAnalysisRepository };
