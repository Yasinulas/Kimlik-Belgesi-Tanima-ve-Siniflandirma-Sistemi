
from ultralytics import YOLO

model = YOLO("best.pt")
print("Sınıflar:", model.names)

path = model.export(format="onnx", opset=12, simplify=True)
print(f"\nExport tamam: {path}")
print("Sıradaki adım: bu dosyayı ../node-api/models/best.onnx olarak kopyala.")
