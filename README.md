# Nirikshan — Unified State CCTV Intelligence & Analytics Platform

[![Architecture](https://img.shields.io/badge/Architecture-7--Layer%20Decoupled-00f2fe?style=for-the-badge)](./ARCHITECTURE.md)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3%20Specification-10b981?style=for-the-badge)](./api-spec.yaml)
[![Docker](https://img.shields.io/badge/Docker-Microservices%20Ready-2563eb?style=for-the-badge)](./docker-compose.yml)
[![DPDP Act](https://img.shields.io/badge/DPDP%20Act%202023-Consent%20Compliant-a855f7?style=for-the-badge)](./src/api/client.js)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dhakarajay359-commits/cctv_project)

**Nirikshan** is a modular, API-first unified CCTV intelligence and surveillance analytics platform designed for state governments to integrate heterogeneous camera infrastructure across **26+ sovereign departments** (Police, RTO, Municipal Corporations, Civil Supplies, Forest & Wildlife, and Private Commercial Opt-In Feeds).

---

## 🏛️ Core Architectural Principles

1. **API-First Contract**: Every module exposes documented REST APIs defined in [`api-spec.yaml`](./api-spec.yaml). All frontend views interact strictly through a single client module ([`/src/api/client.js`](./src/api/client.js)).
2. **Department Sovereignty & Zero-Trust RBAC**: Departments retain 100% ownership of their hardware. Multi-tenant queries are cryptographically scoped by `department_id`.
3. **Bandwidth Discipline (No Forced Central Recording)**: Video stays in local edge ring-buffers (15 days). Thin metadata (< 5 kbps) travels across the WAN; full 1080p WebRTC streams are pulled dynamically on-demand with automated 5-minute inactivity timeouts.
4. **Cross-Department Trajectory Tracking & Predictive Interception**: Stitches together multi-agency ANPR sightings across jurisdictions, calculates segment speeds ($v = \Delta d / \Delta t$), and predicts forward roadblock locations with 1-click tactical dispatch.
5. **DPDP Act 2023 Compliance**: Private commercial and society cameras onboard via verifiable digital consent certificates with granular scopes and 1-click revocation.

---

## 🏗️ 7-Layer Scalable Architecture

```
[ Department CCTV & VMS Networks (Hikvision, Dahua, CP Plus, Axis, Bosch) ]
                               │
L0  Edge Adapter Layer          ──► Protocol Normalization (ONVIF/RTSP/NetSDK) & Edge Buffer
L1  Central Registry & GIS      ──► Master PostGIS Geospatial Registry & 24h Health Heartbeat
L2  Unified Streaming Gateway   ──► On-Demand WebRTC/HLS Relay (Zero continuous WAN load)
L3  Vision Analytics Engine     ──► YOLOv8 OCR Plate Recognition & Multi-Modal Vision
L4  Integration Gateway         ──► High-Speed Bridge to VAHAN 4.0, SARTHI, eGujCop, NAFIS
L5  Alert & Event Bus (Kafka)   ──► Pub/Sub Real-Time Threat Routing (< 2.5s Intercept)
L6  Unified Command Dashboard   ──► Statewide GIS Matrix, Multi-Wall Grid, RBAC Governance
```

---

## 💰 Statewide Financial Feasibility & Taxpayer Dividend

| Parameter | Legacy 24/7 Central Recording | Nirikshan Edge + On-Demand Model | Taxpayer Dividend |
| :--- | :--- | :--- | :--- |
| **State WAN Bandwidth** | 200.0 Gbps (Congested) | **4.8 Mbps (Optimal)** | **99.8% Load Reduction** |
| **Central Cloud Storage** | 69.1 Petabytes (30 Days) | **480 Gigabytes (Metadata Only)** | **99.99% Storage Savings** |
| **Hardware Replacement CAPEX** | ₹450 Crore | **₹0 (Edge Adapter Normalized)** | **₹450 Crore Saved** |
| **5-Year Bandwidth & Storage OPEX** | ₹790 Crore | **₹78 Crore** | **₹712 Crore Saved** |
| **Total 5-Year State Expenditure** | **₹1,240 Crore** | **₹78 Crore** | **₹1,162 Crore Saved (93.7% ROI)** |

---

## 🚀 Quick Start & Local Run

### Option 1: Standalone Web Server
```bash
# Start lightweight local web server
python -m http.server 8080

# Access the platform
open http://localhost:8080/
```

### Option 2: Docker Compose (Microservices Orchestration)
```bash
# Spin up all 7 layers containerized
docker-compose up -d

# Verify running microservices
docker-compose ps
```

### Option 3: 1-Click Render Blueprint Cloud Deployment
1. Connect your GitHub repository to [Render.com](https://render.com).
2. Go to **Blueprints** -> **New Blueprint Instance**.
3. Select your `cctv_project` repository.
4. Render will automatically detect [`render.yaml`](./render.yaml) and deploy the dashboard web service with automatic SSL, zero downtime deploys, and health checks (`/healthz`).

---

## 📁 Repository Structure

```
├── render.yaml           # Render.com Blueprint Infrastructure as Code Specification
├── server.js             # Production Node.js Web Server with /healthz endpoint
├── package.json          # Node runtime engine configuration & scripts
├── index.html            # Master Command Dashboard Application UI
├── style.css             # High-Density 24/7 Glassmorphic Dark Design System
├── app.js                # UI Controller, GIS Leaflet Matrix & Event Orchestration
├── src/
│   └── api/
│       └── client.js     # Single API-First REST Client (Adapters, VAHAN, Kafka, RBAC)
├── api-spec.yaml         # Consolidated OpenAPI 3.0.3 Specification (18+ endpoints)
├── docker-compose.yml    # Multi-Container Microservices Deployment
├── ARCHITECTURE.md       # Technical Whitepaper & Financial Feasibility Study
└── README.md             # Project Documentation & Getting Started Guide
```

---

## ⚖️ Governance & Compliance
- **Section 65B Indian Evidence Act**: Cryptographically hashed audit log with timestamped chain of custody.
- **Digital Personal Data Protection (DPDP) Act 2023**: Verifiable citizen consent lifecycle management.
