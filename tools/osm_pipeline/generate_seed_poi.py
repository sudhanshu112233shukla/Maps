#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


SEED_POI_BY_REGION = {
    "usa": [
        {"name": "New York, USA", "type": "city", "lng": -74.0060, "lat": 40.7128, "keywords": ["city"]},
        {"name": "Los Angeles, USA", "type": "city", "lng": -118.2437, "lat": 34.0522, "keywords": ["city"]},
        {"name": "Love's Travel Stop Oklahoma", "type": "fuel", "lng": -97.5164, "lat": 35.4676, "keywords": ["fuel", "diesel", "truck"]},
        {"name": "Tesla Supercharger Barstow", "type": "charging", "lng": -117.0173, "lat": 34.8958, "keywords": ["ev", "charger"]},
        {"name": "Mayo Clinic Rochester", "type": "hospital", "lng": -92.4668, "lat": 44.0225, "keywords": ["hospital", "emergency"]},
    ],
    "japan": [
        {"name": "Tokyo, Japan", "type": "city", "lng": 139.6917, "lat": 35.6895, "keywords": ["city"]},
        {"name": "Osaka, Japan", "type": "city", "lng": 135.5023, "lat": 34.6937, "keywords": ["city"]},
        {"name": "ENEOS Shinjuku Service Station", "type": "fuel", "lng": 139.7006, "lat": 35.6901, "keywords": ["fuel", "petrol"]},
        {"name": "Nissan EV Quick Charger Yokohama", "type": "charging", "lng": 139.6380, "lat": 35.4437, "keywords": ["ev", "charger"]},
        {"name": "St. Luke's International Hospital", "type": "hospital", "lng": 139.7753, "lat": 35.6676, "keywords": ["hospital", "emergency"]},
    ],
    "skorea": [
        {"name": "Seoul, South Korea", "type": "city", "lng": 126.9780, "lat": 37.5665, "keywords": ["city"]},
        {"name": "Busan, South Korea", "type": "city", "lng": 129.0756, "lat": 35.1796, "keywords": ["city"]},
        {"name": "GS Caltex Seoul Station Fuel", "type": "fuel", "lng": 126.9707, "lat": 37.5547, "keywords": ["fuel", "diesel"]},
        {"name": "Hyundai EV Charging Hub Gangnam", "type": "charging", "lng": 127.0473, "lat": 37.5172, "keywords": ["ev", "charger"]},
        {"name": "Seoul National University Hospital", "type": "hospital", "lng": 126.9988, "lat": 37.5796, "keywords": ["hospital", "emergency"]},
    ],
    "uk": [
        {"name": "London, United Kingdom", "type": "city", "lng": -0.1276, "lat": 51.5072, "keywords": ["city"]},
        {"name": "Manchester, United Kingdom", "type": "city", "lng": -2.2426, "lat": 53.4808, "keywords": ["city"]},
        {"name": "BP Hammersmith Service Station", "type": "fuel", "lng": -0.2275, "lat": 51.4935, "keywords": ["fuel", "diesel"]},
        {"name": "Instavolt Charging Milton Keynes", "type": "charging", "lng": -0.7594, "lat": 52.0406, "keywords": ["ev", "charger"]},
        {"name": "St Thomas' Hospital London", "type": "hospital", "lng": -0.1184, "lat": 51.4980, "keywords": ["hospital", "emergency"]},
    ],
    "russia": [
        {"name": "Moscow, Russia", "type": "city", "lng": 37.6173, "lat": 55.7558, "keywords": ["city"]},
        {"name": "Saint Petersburg, Russia", "type": "city", "lng": 30.3351, "lat": 59.9343, "keywords": ["city"]},
        {"name": "Lukoil M4 Highway Fuel Stop", "type": "fuel", "lng": 39.2043, "lat": 51.6720, "keywords": ["fuel", "diesel"]},
        {"name": "Rosseti EV Charger Moscow Ring", "type": "charging", "lng": 37.4961, "lat": 55.6502, "keywords": ["ev", "charger"]},
        {"name": "Botkin Hospital Moscow", "type": "hospital", "lng": 37.5488, "lat": 55.7731, "keywords": ["hospital", "emergency"]},
    ],
    "australia": [
        {"name": "Sydney, Australia", "type": "city", "lng": 151.2093, "lat": -33.8688, "keywords": ["city"]},
        {"name": "Melbourne, Australia", "type": "city", "lng": 144.9631, "lat": -37.8136, "keywords": ["city"]},
        {"name": "Ampol Outback Highway Fuel", "type": "fuel", "lng": 138.6007, "lat": -34.9285, "keywords": ["fuel", "diesel"]},
        {"name": "Chargefox EV Hub Sydney", "type": "charging", "lng": 151.2060, "lat": -33.8757, "keywords": ["ev", "charger"]},
        {"name": "Royal Melbourne Hospital", "type": "hospital", "lng": 144.9557, "lat": -37.7983, "keywords": ["hospital", "emergency"]},
    ],
    "europe": [
        {"name": "Berlin, Europe", "type": "city", "lng": 13.4050, "lat": 52.5200, "keywords": ["city"]},
        {"name": "Paris, Europe", "type": "city", "lng": 2.3522, "lat": 48.8566, "keywords": ["city"]},
        {"name": "TotalEnergies A1 Fuel Plaza", "type": "fuel", "lng": 6.1432, "lat": 49.6116, "keywords": ["fuel", "diesel"]},
        {"name": "Ionity Fast Charge Hub", "type": "charging", "lng": 8.6821, "lat": 50.1109, "keywords": ["ev", "charger"]},
        {"name": "Charite Hospital Berlin", "type": "hospital", "lng": 13.3777, "lat": 52.5265, "keywords": ["hospital", "emergency"]},
    ],
}


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    poi_dir = repo_root / "public" / "data" / "poi"
    poi_dir.mkdir(parents=True, exist_ok=True)

    for region_id, rows in SEED_POI_BY_REGION.items():
        payload = []
        for row in rows:
            payload.append(
                {
                    **row,
                    "region": region_id,
                }
            )
        out_path = poi_dir / f"{region_id}.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"[ok] wrote {out_path}")


if __name__ == "__main__":
    main()
