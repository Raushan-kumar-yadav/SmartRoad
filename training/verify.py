import os
from pathlib import Path
from collections import defaultdict

merged  = Path(r"e:\Pothole\merged_dataset\train")
img_dir = merged / "images"
lbl_dir = merged / "labels"

CLASS_NAMES = {
    0: "pothole", 1: "road_crack", 2: "broken_footpath",
    3: "broken_pole", 4: "garbage_dump", 5: "waterlogging"
}

print("=" * 60)
print("VERIFICATION REPORT")
print("=" * 60)

# 1 — Count totals
imgs = set(p.stem for p in img_dir.glob("*.*")
           if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
lbls = set(p.stem for p in lbl_dir.glob("*.txt"))
print(f"Images : {len(imgs)}")
print(f"Labels : {len(lbls)}")

# 2 — Mismatch check
imgs_no_lbl = imgs - lbls
lbl_no_img  = lbls - imgs
print(f"Images missing label : {len(imgs_no_lbl)}")
print(f"Orphan label files   : {len(lbl_no_img)}")
for x in list(imgs_no_lbl)[:5]:
    print(f"  no-label: {x}")
for x in list(lbl_no_img)[:5]:
    print(f"  orphan  : {x}")

# 3 — Class distribution + format validation
print()
class_counts = defaultdict(int)
empty_files  = []
bad_format   = []

for lbl_path in lbl_dir.glob("*.txt"):
    lines = lbl_path.read_text(encoding="utf-8", errors="ignore").strip().splitlines()
    if not lines:
        empty_files.append(lbl_path.name)
        continue
    for line in lines:
        parts = line.strip().split()
        if len(parts) != 5:
            bad_format.append(lbl_path.name)
            break
        try:
            cls    = int(parts[0])
            coords = [float(v) for v in parts[1:]]
            if any(c < 0 or c > 1.01 for c in coords):
                bad_format.append(lbl_path.name)
                break
            class_counts[cls] += 1
        except ValueError:
            bad_format.append(lbl_path.name)
            break

print("CLASS DISTRIBUTION:")
total_boxes = 0
for cls_id in sorted(class_counts):
    name = CLASS_NAMES.get(cls_id, f"unknown_{cls_id}")
    n    = class_counts[cls_id]
    bar  = "#" * min(n // 500, 40)
    print(f"  [{cls_id}] {name:<18} {n:>8} boxes  {bar}")
    total_boxes += n

unknown = [c for c in class_counts if c not in CLASS_NAMES]
print()
print(f"Total boxes      : {total_boxes}")
print(f"Empty label files: {len(empty_files)}")
print(f"Bad format files : {len(bad_format)}")
print(f"Unknown class IDs: {unknown}")
for x in bad_format[:5]:
    print(f"  bad: {x}")

# 4 — Sample label sanity
print()
print("SAMPLE LABELS (3 files):")
for lbl_path in list(lbl_dir.glob("*.txt"))[:3]:
    print(f"  {lbl_path.name}")
    for line in lbl_path.read_text().strip().splitlines()[:2]:
        parts = line.split()
        cls   = int(parts[0])
        cname = CLASS_NAMES.get(cls, "?")
        print(f"    class={cls}({cname}) cx={parts[1]} cy={parts[2]} w={parts[3]} h={parts[4]}")

# 5 — data.yaml
print()
yaml_path = Path(r"e:\Pothole\merged_dataset\data.yaml")
if yaml_path.exists():
    print("data.yaml: EXISTS")
    print(yaml_path.read_text())
else:
    print("data.yaml: MISSING - writing now...")
    yaml_path.write_text(
        f"train: {(merged / 'images').as_posix()}\n"
        f"val:   {(merged.parent / 'valid' / 'images').as_posix()}\n\n"
        "nc: 6\nnames:\n"
        "  0: pothole\n  1: road_crack\n  2: broken_footpath\n"
        "  3: broken_pole\n  4: garbage_dump\n  5: waterlogging\n"
    )
    print("  Written!")

print("=" * 60)
print("VERIFICATION COMPLETE")
print("=" * 60)
