 
# ── CELL 1: Mount Google Drive ────────────────────────────────
from google.colab import drive
drive.mount('/content/drive')

# ── CELL 2: Install dependencies ─────────────────────────────
pip install ultralytics -q

# ── CELL 3: Unzip dataset ─────────────────────────────────────
import zipfile, os

ZIP_PATH    = "/content/drive/MyDrive/merged_dataset.zip"  
EXTRACT_DIR = "/content/merged_dataset"

print("Unzipping dataset...")
with zipfile.ZipFile(ZIP_PATH, 'r') as z:
    z.extractall(EXTRACT_DIR)
print("Done!")

# Show structure
for root, dirs, files in os.walk(EXTRACT_DIR):
    depth = root.replace(EXTRACT_DIR, '').count(os.sep)
    if depth > 2:
        continue
    indent = '  ' * depth
    print(f"{indent}{os.path.basename(root)}/  ({len(files)} files)")

# ── CELL 4: Fix data.yaml paths for Colab ────────────────────
import yaml, pathlib

DATASET_DIR = pathlib.Path(EXTRACT_DIR) / "merged_dataset"

# Rewrite paths to absolute Colab paths
yaml_path = DATASET_DIR / "data.yaml"
data_yaml = {
    "train": str(DATASET_DIR / "train" / "images"),
    "val":   str(DATASET_DIR / "valid" / "images"),
    "nc":    6,
    "names": {
        0: "pothole",
        1: "road_crack",
        2: "broken_footpath",
        3: "broken_pole",
        4: "garbage_dump",
        5: "waterlogging"
    }
}
with open(yaml_path, "w") as f:
    yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

print("data.yaml updated:")
print(yaml_path.read_text())

# ── CELL 5: Check GPU ─────────────────────────────────────────
import torch
print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NOT AVAILABLE - change runtime to GPU!'}")
print(f"CUDA: {torch.version.cuda}")

# ── CELL 6: Train ─────────────────────────────────────────────
from ultralytics import YOLO

# Options: yolo11n (fastest/smallest) | yolo11s | yolo11m | yolo11l | yolo11x (best)
# For Raspberry Pi 5 deployment → use yolo11n or yolo11s
MODEL = "yolo11n.pt"

model = YOLO(MODEL)

results = model.train(
    data     = str(yaml_path),
    epochs   = 100,
    imgsz    = 640,
    batch    = 32,          # reduce to 16 if out of memory
    workers  = 4,
    device   = 0,           # GPU
    name     = "road_defect_v1",
    project  = "/content/drive/MyDrive/runs",  # save directly to Drive
    patience = 20,          # early stop if no improvement for 20 epochs
    lr0      = 0.01,
    lrf      = 0.001,
    mosaic   = 1.0,         # mosaic augmentation ON
    flipud   = 0.3,
    fliplr   = 0.5,
    degrees  = 10.0,
    translate= 0.1,
    scale    = 0.5,
    hsv_h    = 0.015,
    hsv_s    = 0.7,
    hsv_v    = 0.4,
    val      = True,
    save     = True,
    plots    = True,
)

print("\nTraining complete!")
print(f"Best weights: {results.save_dir}/weights/best.pt")

# ── CELL 7: Validate best model ───────────────────────────────
best_model = YOLO(f"{results.save_dir}/weights/best.pt")
metrics = best_model.val(data=str(yaml_path))

print("\n=== VALIDATION RESULTS ===")
print(f"mAP50      : {metrics.box.map50:.4f}")
print(f"mAP50-95   : {metrics.box.map:.4f}")
print(f"Precision  : {metrics.box.mp:.4f}")
print(f"Recall     : {metrics.box.mr:.4f}")

# Per-class results
names = ["pothole","road_crack","broken_footpath","broken_pole","garbage_dump","waterlogging"]
print("\nPer-class AP50:")
for i, ap in enumerate(metrics.box.ap50):
    print(f"  [{i}] {names[i]:<18}: {ap:.4f}")

# ── CELL 8: Export for Raspberry Pi (NCNN format) ────────────
print("\nExporting to NCNN for Raspberry Pi...")
best_model.export(format="ncnn", imgsz=640)
print("Done! Download the *_ncnn_model folder from Drive and copy to Pi.")

# ── CELL 9: Quick test on a sample image ─────────────────────
import glob, random
from PIL import Image
import matplotlib.pyplot as plt

# Pick a random val image
val_images = glob.glob(str(DATASET_DIR / "valid" / "images" / "*.jpg"))
sample = random.choice(val_images)

results_inf = best_model(sample, conf=0.25)
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
axes[0].imshow(Image.open(sample))
axes[0].set_title("Original")
axes[0].axis("off")
axes[1].imshow(results_inf[0].plot()[:, :, ::-1])
axes[1].set_title("Detections")
axes[1].axis("off")
plt.tight_layout()
plt.savefig("/content/drive/MyDrive/runs/sample_detection.png", dpi=150)
plt.show()
print(f"Sample: {sample}")
