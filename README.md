# Doküman Analiz Servisi (KYC)

Yüklenen bir görselin (kimlik, ehliyet, pasaport) tipini ve güven yüzdesini
tespit eden servis. Tamamen **Node.js** — model dahil, hiç Python bağımlılığı yok.

## Mimari

```
Tarayıcı (frontend)
      │  base64 JSON
      ▼
Node.js API  :3000
  ├─ api/            → route tanımları, Swagger
  ├─ application/     → use case'ler (AnalyzeDocumentUseCase, CheckPhotocopyUseCase)
  ├─ domain/          → iş kuralları, value object'ler, port (arayüz) tanımları
  └─ infrastructure/  → port implementasyonları: ONNX (onnxruntime-node), sharp, PostgreSQL
      │
      ▼
   PostgreSQL :5432
```

Katmanlar arasında bağımlılık tek yönlü akar: `domain` hiçbir alt katmanı bilmez,
`application` sadece `domain`'in tanımladığı port'ları (arayüzleri) bilir,
somut implementasyonlar (`infrastructure`) bu port'ları uygular ve gerçek bağlama
`server.js`'teki composition root'ta yapılır.

Model aslında YOLOv8 (`best.pt`, PyTorch formatı) — Node.js bunu doğrudan
çalıştıramaz. Bu yüzden model **tek seferlik** olarak ONNX'e export edildi
(`export-model/` klasörü, bkz. aşağı) ve Node.js tarafı `onnxruntime-node` ile
o ONNX dosyasını çalıştırıyor. Yani **çalışan uygulamada Python yok** —
Python sadece modeli bir kere dışa aktarırken, geliştirme aşamasında kullanıldı.

## Tanınan sınıflar

| id | sınıf | anlamı |
|----|-------|--------|
| 0 | `none_valid` | geçerli doküman yok |
| 1 | `tr_card_foreign` | doküman üzerinde yabancı cisim |
| 2 | `tr_driver_back` | ehliyet arka yüz |
| 3 | `tr_driver_front` | ehliyet ön yüz |
| 4 | `tr_id_back` | TC kimlik arka yüz |
| 5 | `tr_id_front` | TC kimlik ön yüz |
| 6 | `tr_passport` | pasaport |

## Kurulum ve çalıştırma (yerelde, Docker olmadan)

Ayrıca yerel bir PostgreSQL gerekir (host portu 5433 — bu makinede 5432 başka
bir şey tarafından tutulduğu için):
```bash
docker run -d -p 5433:5432 -e POSTGRES_USER=kyc -e POSTGRES_PASSWORD=kyc -e POSTGRES_DB=kyc_vision postgres:16-alpine
```

```bash
cd node-api
cp .env.example .env
npm install
npm start
```

`node-api/models/best.onnx` zaten repo'da hazır — ekstra bir şey yapmana gerek yok.

### Frontend

`frontend/index.html` dosyasını tarayıcıda açman yeterli (Node API `:3000`'de
çalışıyor olmalı).

## Docker ile çalıştırma (önerilen)

```bash
docker compose up --build
```

Bu iki container'ı ayağa kaldırır: `node-api` (:3000, model dahil) ve
`postgres` (host:5433 → container:5432, `docker-compose.yml`'e bak). Veri
`pg-data` volume'ünde kalıcı olarak durur.

Postgres içindeki veriyi doğrudan görmek istersen:
```bash
docker compose exec postgres psql -U kyc -d kyc_vision -c "SELECT id, document_type, side, confidence, created_at FROM analyses ORDER BY created_at DESC;"
```

Görsel bir arayüzle bakmak istersen: **TablePlus**, **DBeaver** veya VS Code'un
**"PostgreSQL" eklentisi** ile `localhost:5433` (user: `kyc`, password: `kyc`,
db: `kyc_vision`) adresine bağlanabilirsin.

## Modeli yeniden export etmek istersen

Yeni bir `best.pt` eğitildiğinde, ONNX'e çevirmek için (tek seferlik, Python gerekir):

```bash
cd export-model
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python export_onnx.py
cp best.onnx ../node-api/models/best.onnx
```

## Endpoint'ler

- `POST /api/analyze` — görsel gönder, tip + güven yüzdesi al (sonuç Postgres'e de kaydedilir)
- `GET /api/history` — son analizleri (en yeni önce, `?limit=` ile sınırlanabilir) listeler
- `GET /api/classes` — desteklenen sınıfların listesi
- `POST /api/photocopy-check` — görsel gönder, fotokopi/tarama mı yoksa gerçek bir fotoğraf mı olduğuna dair istatistiksel (ML olmayan) bir tahmin al
- `POST /api/screenshot-check` — görsel gönder, ekran görüntüsü mü yoksa gerçek bir fotoğraf mı olduğuna dair istatistiksel (ML olmayan) bir tahmin al
- `POST /api/document-verify` — yukarıdaki üç kontrolü sırayla çalıştırır (belge tipi → fotokopi → ekran görüntüsü); hepsi geçilirse ve belge kimlik/pasaportsa (ehliyet hariç) son adımda OCR ile üzerindeki bilgileri de okuyup `extractedInfo` içinde döner — kimlik ön yüzünde alan bazlı okuma, kimlik arka yüzü/pasaportta MRZ. Okunan kimlik bilgileri veritabanına kaydedilmez, sadece response'ta döner.
- `GET /api-docs` — Swagger UI
- `GET /api-docs.json` — ham OpenAPI spec (dış araçlara import için)
- `GET /health` — sağlık kontrolü

### HEIC desteği

iPhone'ların varsayılan fotoğraf formatı olan HEIC, `sharp`'ın prebuilt binary'sinde
desteklenmiyor (HEVC codec'inin patent lisansı yüzünden). Yukarıdaki tüm endpoint'ler
görseli işlemeden önce otomatik olarak gerçek bir piksel-decode denemesi yapar; HEIC ise
`heic-convert` (WASM tabanlı libheif) ile JPEG'e çevirip öyle devam eder — client
tarafında dönüştürme gerekmez.

### İstek

```http
POST http://localhost:3000/api/analyze
Content-Type: application/json
```
```json
{ "image": "data:image/jpeg;base64,/9j/4AAQ...", "conf": 0.25 }
```

### Yanıt

```json
{
  "status": "success",
  "isValidDocument": true,
  "topPrediction": {
    "documentType": "tr_id_front",
    "label": "TC Kimlik Kartı (Ön Yüz)",
    "documentCategory": "id_card",
    "side": "front",
    "confidence": 86.3
  },
  "totalDetections": 2,
  "detections": [
    { "className": "tr_id_front", "label": "TC Kimlik Kartı (Ön Yüz)", "confidence": 86.30, "box": { "x1": 120, "y1": 88, "x2": 610, "y2": 400 } }
  ]
}
```

### Hata formatı

```json
{ "status": "error", "code": "IMAGE_TOO_LARGE", "message": "En fazla 10 MB." }
```

Kodlar: `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `MODEL_ERROR`, `INTERNAL_ERROR`.

## Klasör yapısı

```
bixcod/
├── node-api/                    ← tüm uygulama: API + Swagger + ONNX inference + OCR + PostgreSQL
│   ├── src/
│   │   ├── server.js             ← composition root, uygulamayı başlatır
│   │   ├── api/                   ← routes.js (endpoint + Swagger yorumları), swagger.js
│   │   ├── application/           ← use case'ler: AnalyzeDocumentUseCase, CheckPhotocopyUseCase,
│   │   │                             CheckScreenshotUseCase, ExtractDocumentInfoUseCase (OCR),
│   │   │                             VerifyDocumentUseCase (üçünü sırayla çalıştıran pipeline)
│   │   ├── domain/
│   │   │   ├── documentAnalysis/   ← Detection, DocumentAnalysis, DocumentCategory, port'lar
│   │   │   ├── documentOcr/        ← MrzReader, IdCardFrontFieldReader, IdCardBackFieldReader
│   │   │   ├── photocopy/          ← PhotocopyPolicy (istatistiksel karar kuralı), port
│   │   │   ├── screenshot/         ← ScreenshotPolicy (istatistiksel karar kuralı), port
│   │   │   └── shared/             ← Base64Image, ValueError
│   │   └── infrastructure/
│   │       ├── onnx/               ← OnnxDetector (ONNX Runtime adapter'ı)
│   │       ├── db/                 ← PostgreSQL bağlantısı + repository implementasyonları
│   │       ├── sharpImageProcessor.js  ← sharp ile kanal/doygunluk istatistikleri + OCR ön işleme
│   │       ├── tesseractOcrProvider.js ← Tesseract.js adapter'ı (çoklu açı deneme dahil)
│   │       └── heicConverter.js        ← HEIC → JPEG dönüşümü (heic-convert)
│   └── models/best.onnx          ← export edilmiş model
├── export-model/                ← best.pt → best.onnx dönüştürme scripti (tek seferlik, runtime'ın parçası değil)
├── frontend/                     ← tek sayfa (HTML/CSS/JS)
└── docker-compose.yml            ← node-api + postgres
```
