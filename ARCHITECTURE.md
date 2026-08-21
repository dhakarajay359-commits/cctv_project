# Nirikshan: Architectural Whitepaper & State Deployment Blueprint

**Platform Overview**: Unified CCTV Intelligence & Edge Analytics Platform for the Government of Gujarat. Integrates 80,000+ heterogeneous cameras across 26+ state departments without continuous 24/7 centralized video recording, achieving 93.7% taxpayer savings.

---

## 1. 7-Layer Architecture Blueprint

```
[26+ Gujarat State Dept CCTV / VMS Networks — Unchanged Legacy Hardware]
                               │
L0  Edge Protocol Adapter Layer │ Protocol normalization (ONVIF Profile S/T, RTSP, Vendor NetSDK)
                               │ Optional edge AI inference (YOLOv8 micro-models)
                               ▼
L1  Central Registry & GIS      │ PostGIS spatial index, camera metadata, 24h health telemetry
                               ▼
L2  Unified Streaming Gateway   │ On-demand WebRTC / HLS relay, 5-min inactivity TTL (No central storage)
                               ▼
L3  Vision Analytics Engine     │ Optical OCR ANPR, CCTNS facial matching, crowd surge detection
                               ▼
L4  Integration Gateway         │ Secure mTLS API bridge to VAHAN 4.0, SARTHI, eGujCop/CCTNS, NAFIS
                               ▼
L5  Kafka Alert & Event Bus     │ Topic-partitioned real-time event distribution (sub-2.5s intercept)
                               ▼
L6  Unified Command Dashboard   │ API-first command interface, multi-tenant RBAC, DPDP consent ledger
```

---

## 2. Bandwidth & Financial Feasibility Study: Legacy vs. Nirikshan

### Comparative Matrix (80,000 Cameras Statewide)

| Metric | Legacy Centralized Approach (Force Recording) | Nirikshan Edge + On-Demand Model | Difference / Advantage |
| :--- | :--- | :--- | :--- |
| **Video Transmission** | 24/7 Continuous Video Relayed to Central Cloud | Thin Metadata & Events Only (Streams On-Demand) | **Bandwidth Reduced by 99.8%** |
| **State WAN Bandwidth** | **200 Gbps Continuous Load** | **4.8 Mbps Peak On-Demand Relay** | Zero Network Congestion |
| **Central Storage Required** | 69,120 Terabytes (69.1 Petabytes / 30 Days) | 480 Gigabytes (Metadata & Event Signatures Only) | **99.99% Storage Savings** |
| **Hardware Replacement CAPEX** | ₹450 Crore (Forced IP Camera Standardization) | ₹0 (Normalized via L0 Edge Protocol Adapters) | **100% CAPEX Elimination** |
| **Cloud Storage & Bandwidth OPEX**| ₹790 Crore (5-Year State Leased Lines & S3) | ₹78 Crore (5-Year Microservices Compute & Kafka)| **₹712 Crore Savings** |
| **Total 5-Year State Expenditure**| **₹1,240 Crore** | **₹78 Crore** | **₹1,162 Crore Taxpayer Savings (93.7% ROI)** |

---

## 3. Kubernetes (K8s) Production Deployment & Horizontal Pod Autoscaling (HPA)

### Microservice Scaling Architecture
- **Stateless Streaming Gateway (`nirikshan-streaming-gateway`)**:
  - Autoscales on CPU utilization ($>70\%$) and active WebRTC peer connections.
  - Scale range: `5` to `80` replicas during statewide law enforcement incidents.
- **Vision Analytics Engine (`nirikshan-analytics-engine`)**:
  - Autoscales on Kafka Consumer Lag on topic `gujarat.vision.inferences`.
  - Deployed on GPU nodes (`nvidia.com/gpu`) with TensorRT optimization for sub-80ms YOLOv8 inferences.
- **Central Registry (`nirikshan-registry-gis`)**:
  - PostgreSQL 15 + PostGIS with Citus multi-node sharding partitioned by Gujarat District IDs (`district_id`).

### Sample Kubernetes HPA Manifest
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nirikshan-streaming-gateway-hpa
  namespace: surveillance-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nirikshan-streaming-gateway
  minReplicas: 5
  maxReplicas: 80
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 4. Legal Compliance & Governance

- **DPDP Act 2023 Compliant**: Private society cameras onboarding requires explicit digital consent certificates with defined scopes (`Metadata Only`, `View-Only`, `Analytics-Enabled`) and 1-click revocation.
- **Section 65B Indian Evidence Act**: Every forensic video clip export includes an immutable SHA-256 cryptographic seal and timestamp certificate for court admissibility.
