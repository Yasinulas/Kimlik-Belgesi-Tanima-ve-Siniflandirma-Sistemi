const { PhotocopyCheckRepository } = require("../../domain/photocopy/PhotocopyCheckRepository");
const { getPool } = require("./connection");

class PostgresPhotocopyRepository extends PhotocopyCheckRepository {
  async save(isPhotocopy) {
    await getPool().query(`INSERT INTO photocopy_checks (is_photocopy) VALUES ($1)`, [isPhotocopy]);
  }
}

const postgresPhotocopyRepository = new PostgresPhotocopyRepository();

module.exports = { PostgresPhotocopyRepository, postgresPhotocopyRepository };
