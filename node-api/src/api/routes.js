const express = require("express");
const { DocumentCategory } = require("../domain/documentAnalysis/DocumentCategory");

// Bu katman hiçbir SQL/ONNX/sharp bilmez — sadece kendisine enjekte edilen
// use case'leri ve repository'yi çağırır, HTTP'ye özgü işleri (status kodu, response şekli) yapar.
function createRouter({ analyzeDocumentUseCase, checkPhotocopyUseCase, checkScreenshotUseCase, verifyDocumentUseCase, analysisRepository }) {
  const router = express.Router();

  /**
   * @openapi
   * /api/analyze:
   *   post:
   *     summary: Görseldeki doküman tipini ve güven yüzdesini tespit eder
   *     description: >
   *       Görsel base64 olarak gönderilir. Kimlik doğrulaması gerekmez.
   *       Cevaptaki documentCategory ("id_card" | "driver_license" | "passport")
   *       belge tipini, side ("front" | "back") ise yüzünü belirtir — pasaportta
   *       model ön/arka ayrımını öğrenmediği için side alanı hiç dönmez, sadece
   *       documentCategory: "passport" görürsün.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [image]
   *             properties:
   *               image:
   *                 type: string
   *                 format: byte
   *                 description: Base64 görsel (data-URL öneki opsiyonel)
   *                 example: "iVBORw0KGgoAAAANSUhEUgAAAAUA..."
   *               conf:
   *                 type: number
   *                 default: 0.25
   *                 description: Güven eşiği (0-1). Yükseltirsen daha az ama daha emin sonuç gelir.
   *     responses:
   *       200:
   *         description: Analiz başarılı
   *       400:
   *         description: Geçersiz base64 veya eksik alan
   *       413:
   *         description: Görsel çok büyük
   *       500:
   *         description: Analiz sırasında beklenmeyen bir hata oluştu
   */
  router.post("/analyze", async (req, res, next) => {
    try {
      const result = await analyzeDocumentUseCase.execute(req.body.image, req.body.conf);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/classes:
   *   get:
   *     summary: Modelin tanıdığı doküman tiplerini listeler
   *     responses:
   *       200:
   *         description: Sınıf listesi
   */
  router.get("/classes", (req, res) => {
    res.json(DocumentCategory.allClasses());
  });

  /**
   * @openapi
   * /api/history:
   *   get:
   *     summary: Son analizleri listeler (en yeni önce)
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Kaç kayıt dönsün (1-100)
   *     responses:
   *       200:
   *         description: Analiz geçmişi
   */
  router.get("/history", async (req, res, next) => {
    try {
      const requested = parseInt(req.query.limit, 10);
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 50;

      const rows = await analysisRepository.findRecent(limit);

      const items = rows.map((row) => ({
        status: row.status,
        isValidDocument: row.is_valid_document,
        topPrediction: row.document_type ? {
          documentType: row.document_type,
          label: row.label,
          confidence: row.confidence,
          documentCategory: row.document_category,
          ...(DocumentCategory.shouldShowSide(row.document_category) ? { side: row.side } : {}),
        } : null,
        totalDetections: row.total_detections,
        detections: row.detections,
        createdAt: row.created_at,
      }));

      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/photocopy-check:
   *   post:
   *     summary: Bir görselin fotokopi/tarama olup olmadığını tespit eder
   *     description: >
   *       Görselin renk kanallarını (doygunluk, parlaklık, kontrast) analiz ederek gerçek
   *       renkli bir fotoğraf mı yoksa taranmış/fotokopi bir belge mi olduğuna dair sezgisel
   *       bir tahmin yapar. ML tabanlı değildir, istatistiksel bir kontroldür.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [image]
   *             properties:
   *               image:
   *                 type: string
   *                 format: byte
   *                 description: Base64 görsel (data-URL öneki opsiyonel)
   *     responses:
   *       200:
   *         description: Analiz başarılı
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 isPhotocopy:
   *                   type: boolean
   *       400:
   *         description: Geçersiz base64 veya eksik alan
   *       413:
   *         description: Görsel çok büyük
   *       500:
   *         description: Analiz sırasında beklenmeyen bir hata oluştu
   */
  router.post("/photocopy-check", async (req, res, next) => {
    try {
      const { isPhotocopy } = await checkPhotocopyUseCase.execute(req.body.image);
      res.json({ status: "success", isPhotocopy });
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/screenshot-check:
   *   post:
   *     summary: Bir görselin ekran görüntüsü (screenshot) olup olmadığını tespit eder
   *     description: >
   *       Görselin EXIF metadata'sını, dosya formatını ve renk çeşitliliğini analiz ederek
   *       gerçek bir kamera fotoğrafı mı yoksa bir cihazdan alınmış ekran görüntüsü mü
   *       olduğuna dair sezgisel bir tahmin yapar. ML tabanlı değildir, istatistiksel bir kontroldür.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [image]
   *             properties:
   *               image:
   *                 type: string
   *                 format: byte
   *                 description: Base64 görsel (data-URL öneki opsiyonel)
   *                 example: "iVBORw0KGgoAAAANSUhEUgAAAAUA..."
   *     responses:
   *       200:
   *         description: Analiz başarılı
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 isScreenshot:
   *                   type: boolean
   *       400:
   *         description: Geçersiz base64 veya eksik alan
   *       413:
   *         description: Görsel çok büyük
   *       500:
   *         description: Analiz sırasında beklenmeyen bir hata oluştu
   */
  router.post("/screenshot-check", async (req, res, next) => {
    try {
      const { isScreenshot } = await checkScreenshotUseCase.execute(req.body.image);
      res.json({ status: "success", isScreenshot });
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/document-verify:
   *   post:
   *     summary: Bir görseli sırayla belge tipi ve fotokopi kontrolünden geçirip bilgileri okur
   *     description: >
   *       Önce görseldeki doküman tipini tespit eder (ehliyet/pasaport/kimlik).
   *       Geçerli bir doküman tanınmazsa süreç orada durur. Tanınırsa fotokopi/tarama
   *       olup olmadığına bakılır; fotokopiyse süreç orada durur. Ekran görüntüsü
   *       kontrolü de çalışır ve sonucu (isScreenshot) response'ta döner, ama
   *       artık süreci DURDURMUYOR — format (JPEG/PNG) ne olursa olsun belge
   *       tipi ve fotokopi kontrolünü geçen kimlik/pasaport görselinde son adım
   *       olarak OCR ile üzerindeki bilgiler her zaman okunur (kimlik arka
   *       yüzü ve pasaportta MRZ dahil). Ehliyet için OCR desteklenmez
   *       (extractedInfo hep null döner). Okunan kimlik bilgileri veritabanına
   *       kaydedilmez, sadece response'ta döner. Belge tipi/fotokopi kontrolünü
   *       geçen görsel "passed: true" ile döner. Belge tipi/fotokopi/screenshot
   *       kontrolleri kendi tablolarına (analyses / photocopy_checks /
   *       screenshot_checks) kaydedilmeye devam eder.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [image]
   *             properties:
   *               image:
   *                 type: string
   *                 format: byte
   *                 description: Base64 görsel (data-URL öneki opsiyonel)
   *               conf:
   *                 type: number
   *                 default: 0.25
   *                 description: Belge tipi tespiti için güven eşiği (0-1)
   *     responses:
   *       200:
   *         description: Süreç tamamlandı (geçti ya da bir adımda durdu)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 passed:
   *                   type: boolean
   *                   description: Üç adımın tamamı geçildi mi
   *                 failedAt:
   *                   type: string
   *                   nullable: true
   *                   enum: [document_type, photocopy, null]
   *                   description: >
   *                     Süreç hangi adımda durdu (geçtiyse null). "screenshot"
   *                     artık bu listede yok — ekran görüntüsü kontrolü süreci
   *                     durdurmuyor, sonucu ayrıca isScreenshot alanında döner.
   *                 documentAnalysis:
   *                   type: object
   *                   description: /api/analyze ile aynı şekil (isValidDocument, topPrediction, detections...)
   *                 isPhotocopy:
   *                   type: boolean
   *                   nullable: true
   *                   description: Belge tipi tanınmadıysa bu adım hiç çalışmaz, null döner
   *                 isScreenshot:
   *                   type: boolean
   *                   nullable: true
   *                   description: Fotokopi adımı geçilmediyse bu adım hiç çalışmaz, null döner
   *                 extractedInfo:
   *                   type: object
   *                   nullable: true
   *                   description: >
   *                     Üç adım da geçilmediyse veya belge ehliyetse null döner.
   *                     Kimlik/pasaportta OCR ile okunan bilgiler.
   *                   properties:
   *                     mrz:
   *                       type: object
   *                       nullable: true
   *                       description: Sadece kimlik arka yüzü ve pasaportta dolu olur (ön yüzde MRZ yok, null döner)
   *                       properties:
   *                         format:
   *                           type: string
   *                           description: "TD1 (kimlik arka yüzü) veya TD3 (pasaport)"
   *                         gecerli:
   *                           type: boolean
   *                           description: MRZ checksum'ları geçerli mi
   *                         alanlar:
   *                           type: object
   *                           description: >
   *                             belgeKodu, duzenleyenUlke, soyad, ad, belgeNo, uyruk, dogumTarihi
   *                             (GG.AA.YYYY), cinsiyet (Erkek/Kadın), sonGecerlilikTarihi (GG.AA.YYYY),
   *                             kisiselNo. Tarihlerin yüzyılı sezgiyle tahmin edilir, garanti değildir.
   *                     fields:
   *                       type: object
   *                       nullable: true
   *                       description: >
   *                         Pasaportta hep null döner (isim/soyad/uyruk/cinsiyet zaten mrz.alanlar içinde).
   *                         Kimlik ön yüzünde: soyad, ad, dogumTarihi, cinsiyet, uyruk, seriNo,
   *                         sonGecerlilikTarihi, tcKimlikNo.
   *                         Kimlik arka yüzünde: anneAdi, babaAdi, verenMakam (etiket
   *                         kartta yoksa ilgili alan hiç dönmez). Barkod OCR ile okunmaz, bu alanda yer almaz.
   *                     rawText:
   *                       type: string
   *                       description: Tesseract'ın görselden okuduğu ham metin (en iyi çaba, hatalı/eksik olabilir)
   *       400:
   *         description: Geçersiz base64 veya eksik alan
   *       413:
   *         description: Görsel çok büyük
   *       500:
   *         description: Analiz sırasında beklenmeyen bir hata oluştu
   */
  router.post("/document-verify", async (req, res, next) => {
    try {
      const result = await verifyDocumentUseCase.execute(req.body.image, req.body.conf);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createRouter };
