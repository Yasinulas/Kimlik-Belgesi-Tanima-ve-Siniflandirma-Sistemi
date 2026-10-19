const { DocumentCategory } = require("./DocumentCategory");

// Tek bir tespiti (bir bounding box + sınıf) temsil eden value object.
class Detection {
  constructor({ className, confidence, box }) {
    this.className = className;
    this.confidence = confidence;
    this.box = box;
    this.label = DocumentCategory.labelFor(className);
    Object.assign(this, DocumentCategory.infoFor(className));
  }
}

module.exports = { Detection };
