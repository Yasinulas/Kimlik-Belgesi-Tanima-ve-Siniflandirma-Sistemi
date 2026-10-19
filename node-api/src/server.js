require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { createRouter } = require("./api/routes");
const { swaggerUi, spec } = require("./api/swagger");
const { connectDB } = require("./infrastructure/db/connection");
const { onnxDetector } = require("./infrastructure/onnx/OnnxDetector");
const { getChannelStats, getScreenshotSignals } = require("./infrastructure/sharpImageProcessor");
const { recognizeText } = require("./infrastructure/tesseractOcrProvider");
const { postgresAnalysisRepository } = require("./infrastructure/db/PostgresAnalysisRepository");
const { postgresPhotocopyRepository } = require("./infrastructure/db/PostgresPhotocopyRepository");
const { postgresScreenshotRepository } = require("./infrastructure/db/PostgresScreenshotRepository");
const { AnalyzeDocumentUseCase } = require("./application/AnalyzeDocumentUseCase");
const { CheckPhotocopyUseCase } = require("./application/CheckPhotocopyUseCase");
const { CheckScreenshotUseCase } = require("./application/CheckScreenshotUseCase");
const { ExtractDocumentInfoUseCase } = require("./application/ExtractDocumentInfoUseCase");
const { VerifyDocumentUseCase } = require("./application/VerifyDocumentUseCase");

// Composition root: hangi arayüzün hangi somut implementasyonla çalışacağına burada karar verilir.
const analyzeDocumentUseCase = new AnalyzeDocumentUseCase({
  detector: onnxDetector,
  analysisRepository: postgresAnalysisRepository,
});

const checkPhotocopyUseCase = new CheckPhotocopyUseCase({
  imageStatsProvider: getChannelStats,
  photocopyRepository: postgresPhotocopyRepository,
});

const checkScreenshotUseCase = new CheckScreenshotUseCase({
  imageSignalsProvider: getScreenshotSignals,
  screenshotRepository: postgresScreenshotRepository,
});

const extractDocumentInfoUseCase = new ExtractDocumentInfoUseCase({
  ocrProvider: recognizeText,
});

const verifyDocumentUseCase = new VerifyDocumentUseCase({
  analyzeDocumentUseCase,
  checkPhotocopyUseCase,
  checkScreenshotUseCase,
  extractDocumentInfoUseCase,
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.use("/api", createRouter({ analyzeDocumentUseCase, checkPhotocopyUseCase, checkScreenshotUseCase, verifyDocumentUseCase, analysisRepository: postgresAnalysisRepository }));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec));
app.get("/api-docs.json", (req, res) => res.json(spec));

app.get("/health", (req, res) => res.json({ status: "ok" }));


app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    status: "error",
    code: err.code || "INTERNAL_ERROR",
    message: err.message || "Beklenmeyen bir hata oluştu.",
  });
});

const PORT = process.env.PORT || 3000;

Promise.all([connectDB(), onnxDetector.init()]) //veritabanı bağlantısı ve ONNX modeli
  .then(() => {
    app.listen(PORT, () => console.log(`API: http://localhost:${PORT}/api-docs`));
  })
  .catch((err) => {
    console.error("Başlangıç hatası:", err.message);
    process.exit(1);
  });


