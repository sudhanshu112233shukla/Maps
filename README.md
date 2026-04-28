# Neural Maps — Premium Offline Navigation System

Neural Maps is a state-of-the-art, 100% offline navigation application designed for resilience and performance. It combines the aesthetic excellence of Google Maps with a powerful on-device A* routing engine and local AI assistance.

![App Screenshot](https://raw.githubusercontent.com/sudhanshu112233shukla/Maps/main/screenshots/main_ui.png)

## 🌟 Key Features

### 1. Advanced Offline Routing
- **Road-Following A***: Unlike simple mapping apps that draw straight lines, Neural Maps uses a dense road graph to provide true street-level directions.
- **Routing Modes**: Toggle between **Fastest** (minimizes time) and **Safest** (prioritizes well-lit primary roads and avoid narrow alleys).
- **Turn-by-Turn Guidance**: Precise local instructions generated entirely on-device.

### 2. Intelligent Auto-Download
- **Regional Awareness**: On first launch, the app detects your current location and automatically begins downloading the corresponding country/region map.
- **Permanent Storage**: Map data is stored in the background and kept forever, ensuring you never get lost even with zero cellular reception.

### 3. Neural Copilot (On-Device AI)
- **Privacy First**: Uses Transformers.js (Phi-3 Mini) to process natural language queries directly on your phone.
- **Smart Parsing**: "Take me to the nearest hospital avoiding tolls" — the AI understands your intent and configures the router automatically.

### 4. Premium Aesthetic
- **Google Maps DNA**: Familiar rounded UI, quick-search chips (Restaurants, Hotels, etc.), and a high-fidelity Place Panel with photo integration.
- **Smooth Animations**: High-performance cubic-bezier transitions for a fluid, lag-free experience.

## 🛠 Tech Stack
- **Engine**: MapLibre GL JS (WebGL accelerated rendering)
- **Logic**: Vanilla JavaScript (ES6+)
- **Routing**: Custom A* Implementation with Priority Queue
- **AI**: Transformers.js (Xenova)
- **Container**: Capacitor (for iOS/Android deployment)

## 🚀 Future Scope

1. **Vulkan/WebGPU Acceleration**: Move A* processing to the GPU for near-instant route calculation over massive (country-wide) graphs.
2. **AR Navigation**: Implement an Augmented Reality overlay using the device camera for "heads-up" walking directions.
3. **Dynamic Traffic Simulation**: Use historical time-of-day data to adjust routing costs based on predicted traffic patterns, completely offline.
4. **Community Map Updates**: A P2P "Mesh" system to share map updates and road closures between nearby offline devices.

## 📦 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/sudhanshu112233shukla/Maps.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

---
Developed with ❤️ by Antigravity for Sudhanshu Shukla.
