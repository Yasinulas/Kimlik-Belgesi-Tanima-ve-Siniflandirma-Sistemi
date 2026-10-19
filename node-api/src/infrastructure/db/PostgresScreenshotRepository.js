const { ScreenshotCheckRepository } = require("../../domain/screenshot/ScreenshotCheckRepository");
const { getPool } = require("./connection");

class PostgresScreenshotRepository extends ScreenshotCheckRepository {
  async save(isScreenshot) {
    await getPool().query(`INSERT INTO screenshot_checks (is_screenshot) VALUES ($1)`, [isScreenshot]);
  }
}

const postgresScreenshotRepository = new PostgresScreenshotRepository();

module.exports = { PostgresScreenshotRepository, postgresScreenshotRepository };
