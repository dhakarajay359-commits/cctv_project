import cv2, glob, os
from ultralytics import YOLO

files = sorted(glob.glob('captures/*cam16*.jpg'), key=os.path.getmtime, reverse=True)
img = cv2.imread(files[0]) if files else cv2.imread('captures/test_cam16_ondemand.jpg')
fh, fw = img.shape[:2]

model = YOLO('yolov8n.pt')
results = model(img, imgsz=1280, conf=0.14)
boxes = results[0].boxes

detected_vehicles = []
for b in boxes:
    cls_id = int(b.cls.item())
    conf = float(b.conf.item())
    cls_name = model.names[cls_id]
    if cls_id in [2, 3, 5, 7]: # car, motorcycle, bus, truck
        x1, y1, x2, y2 = [int(v) for v in b.xyxy[0].tolist()]
        area = (x2 - x1) * (y2 - y1)
        # Score by area (foreground) and y2 (closer to camera)
        prominence = area * (y2 / fh)
        label = 'TWO-WHEELER (SCOOTER/ACTIVA)' if cls_id == 3 else cls_name.upper()
        detected_vehicles.append({
            'class': label,
            'conf': conf,
            'box': [x1, y1, x2, y2],
            'prominence': prominence,
            'y2': y2
        })

detected_vehicles.sort(key=lambda x: x['prominence'], reverse=True)
print(f'Detected {len(detected_vehicles)} vehicles:')
for v in detected_vehicles:
    print(f"  {v['class']} - Conf: {v['conf']:.2f}, Box: {v['box']}, Prominence: {v['prominence']:.0f}")
