const path = require("path");
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const { DocumentDetector } = require("../../domain/documentAnalysis/DocumentDetector");
const { ValueError } = require("../../domain/shared/ValueError");

const MODEL_PATH = path.join(__dirname, "..", "..", "..", "models", "best.onnx");
const INPUT_SIZE = 640;
const IOU_THRESHOLD = 0.45;

// export sırasında ultralytics'in bastığı model.names sırasıyla birebir aynı olmalı
const CLASS_NAMES = [
  "none_valid",
  "tr_card_foreign",
  "tr_driver_back",
  "tr_driver_front",
  "tr_id_back",
  "tr_id_front",
  "tr_passport",
];

// orantıyı koruyarak 640x640'a sığdırır, boşlukları gri (114,114,114) ile doldurur
async function letterbox(imageBytes) {
  const image = sharp(imageBytes);
  const meta = await image.metadata();
  const { width, height } = meta;
  if (!width || !height) {
    throw new Error("Görsel çözümlenemedi");
  }

  const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);
  const padLeft = Math.floor((INPUT_SIZE - newW) / 2);
  const padTop = Math.floor((INPUT_SIZE - newH) / 2);
  const padRight = INPUT_SIZE - newW - padLeft;
  const padBottom = INPUT_SIZE - newH - padTop;

  const { data, info } = await image
    .resize(newW, newH, { fit: "fill" })
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 114, g: 114, b: 114 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { pixels: data, channels: info.channels, origW: width, origH: height, scale, padLeft, padTop };
}

// HWC uint8 -> NCHW float32 (0-1 normalize)
function toTensor(pixels, channels) {
  const size = INPUT_SIZE * INPUT_SIZE;
  const tensorData = new Float32Array(3 * size);
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const srcIdx = (y * INPUT_SIZE + x) * channels;
      const dstIdx = y * INPUT_SIZE + x;
      tensorData[0 * size + dstIdx] = pixels[srcIdx] / 255;
      tensorData[1 * size + dstIdx] = pixels[srcIdx + 1] / 255;
      tensorData[2 * size + dstIdx] = pixels[srcIdx + 2] / 255;
    }
  }
  return new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return interArea / (areaA + areaB - interArea);
}

// sınıf bazında Non-Max Suppression — aynı nesnenin üst üste binen kutularını eler
function nms(boxes) {
  const byClass = new Map();
  for (const box of boxes) {
    if (!byClass.has(box.classIdx)) byClass.set(box.classIdx, []);
    byClass.get(box.classIdx).push(box);
  }

  const kept = [];
  for (const group of byClass.values()) {
    group.sort((a, b) => b.score - a.score);
    const suppressed = new Array(group.length).fill(false);
    for (let i = 0; i < group.length; i++) {
      if (suppressed[i]) continue;
      kept.push(group[i]);
      for (let j = i + 1; j < group.length; j++) {
        if (!suppressed[j] && iou(group[i], group[j]) > IOU_THRESHOLD) {
          suppressed[j] = true;
        }
      }
    }
  }
  return kept;
}

// ham çıktı: [1, 4+numClasses, numAnchors] -> aday kutular (conf eşiği + NMS uygulanmamış)
function decodeOutput(outputTensor, conf) {
  const data = outputTensor.data;
  const numChannels = outputTensor.dims[1];
  const numAnchors = outputTensor.dims[2];
  const numClasses = numChannels - 4;

  const candidates = [];
  for (let i = 0; i < numAnchors; i++) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numAnchors + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < conf) continue;

    const cx = data[0 * numAnchors + i];
    const cy = data[1 * numAnchors + i];
    const w = data[2 * numAnchors + i];
    const h = data[3 * numAnchors + i];

    candidates.push({
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2,
      score: bestScore,
      classIdx: bestClass,
    });
  }
  return candidates;
}

// Adapter: DocumentDetector portunu ONNX Runtime ile implemente eder.
// Domain/application katmanları bu dosyanın var olduğunu bilmez, sadece DocumentDetector arayüzünü bilir.
class OnnxDetector extends DocumentDetector {
  constructor() {
    super();
    this.sessionPromise = null;
  }

  init() {
    if (!this.sessionPromise) {
      this.sessionPromise = ort.InferenceSession.create(MODEL_PATH).then((session) => {
        console.log("ONNX modeli yüklendi:", MODEL_PATH);
        return session;
      });
    }
    return this.sessionPromise;
  }

  async detect(imageBytes, conf = 0.25) {
    const session = await this.init();

    let letterboxed;
    try {
      letterboxed = await letterbox(imageBytes);
    } catch (err) {
      throw new ValueError("Görsel çözümlenemedi");
    }

    const { pixels, channels, origW, origH, scale, padLeft, padTop } = letterboxed;
    const tensor = toTensor(pixels, channels);

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const results = await session.run({ [inputName]: tensor });
    const output = results[outputName];

    const candidates = decodeOutput(output, conf);
    const kept = nms(candidates);

    return kept.map((box) => {
      // letterbox'ı geri al: 640-uzayından orijinal görsel koordinatlarına
      const x1 = (box.x1 - padLeft) / scale;
      const y1 = (box.y1 - padTop) / scale;
      const x2 = (box.x2 - padLeft) / scale;
      const y2 = (box.y2 - padTop) / scale;

      return {
        className: CLASS_NAMES[box.classIdx] || String(box.classIdx),
        confidence: Math.round(box.score * 100 * 100) / 100,
        box: {
          x1: Math.max(0, Math.round(x1)),
          y1: Math.max(0, Math.round(y1)),
          x2: Math.min(origW, Math.round(x2)),
          y2: Math.min(origH, Math.round(y2)),
        },
      };
    });
  }
}

const onnxDetector = new OnnxDetector();

module.exports = { OnnxDetector, onnxDetector };
