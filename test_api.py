import requests

BASE = "http://localhost:8000"

# 1. Root
r = requests.get(BASE + "/")
print("ROOT:", r.json()["service"])

# 2. Health
r = requests.get(BASE + "/health")
print("HEALTH:", r.json())

# 3. POST pothole
r = requests.post(BASE + "/api/report", json={
    "class_id": 0, "class_name": "pothole",
    "confidence": 0.87, "lat": 28.6139, "lon": 77.2090, "source": "test"
})
p1 = r.json()
print("POST pothole -> id:", p1["id"])

# 4. POST road_crack
r = requests.post(BASE + "/api/report", json={
    "class_id": 1, "class_name": "road_crack",
    "confidence": 0.73, "lat": 28.6140, "lon": 77.2091, "source": "test"
})
p2 = r.json()
print("POST road_crack -> id:", p2["id"])

# 5. POST garbage_dump
r = requests.post(BASE + "/api/report", json={
    "class_id": 4, "class_name": "garbage_dump",
    "confidence": 0.65, "lat": 28.6145, "lon": 77.2095, "source": "test"
})
print("POST garbage_dump -> id:", r.json()["id"])

# 6. List all
r = requests.get(BASE + "/api/reports")
reports = r.json()
print("\nGET /api/reports ->", len(reports), "reports")
for rep in reports:
    print("  #" + str(rep["id"]) + " " + rep["class_name"] + " conf=" + str(rep["confidence"]) + " @ (" + str(rep["lat"]) + "," + str(rep["lon"]) + ")")

# 7. Stats
r = requests.get(BASE + "/api/stats")
stats = r.json()
print("\nGET /api/stats ->", stats)

# 8. Get single report
r = requests.get(BASE + "/api/reports/1")
print("\nGET /api/reports/1 ->", r.json()["class_name"], "created:", r.json()["created_at"])

print("\nALL TESTS PASSED")
