# Autonomous Baltic Cold-Chain Telemetry & Compliance Platform PRD

**Version:** 0.4.2 (Native Rust Engine)  
**Artifact Type:** Software PRD (11 Canonical Sections Verified)

## 1. Problem and desired outcome
- **Proposal:** Perishable cargo losses in Baltic transit due to undetected reefer temperature deviations.

## 2. Users, jobs, and pains
- **Proposal:** Fleet managers need continuous temperature visibility without manual driver logbook checks.

## 3. Product thesis, scope, and non-goals
- **Proposal:** Automated IoT sensor telemetry streaming directly to dispatcher dashboard with edge caching during cellular dead zones.

## 4. Technical boundaries
- **Proposal:** Low-power Bluetooth 5.2 edge nodes communicating with cab gateway; fallback to local flash storage during offline transit.

## 5. Prioritized requirements
- **Proposal:** P0: Real-time temperature and humidity streaming with <=60s latency over 4G/LTE.
- **Proposal:** P0: Automated SMS and webhook alert dispatch upon breach of HACCP temperature thresholds (+/-0.5°C).
- **Proposal:** P1: Offline cryptographic data sealing on edge gateway with automatic sync upon reconnection.

## 6. Acceptance criteria
- **Proposal:** Given a temperature spike above 4°C for >180s, when detected by edge probe, then trigger alert within 15 seconds.

## 7. Risks
- **Proposal:** Extreme cold battery degradation leading to unmonitored transit windows.

## 8. User journeys
- **Proposal:** Dispatcher inspects live map view of active trucks with colored temperature badges.

## 9. Metrics and validation
- **Proposal:** Reduce temperature breach response time from 45 minutes to <2 minutes across a 60-day Baltic pilot fleet.

## 10. Evidence, assumptions, and gaps
- **Gap:** Assumes continuous vehicle auxiliary power availability during transit.

## 11. Next steps
- **Proposal:** Deploy hardware prototype on 5 test vehicles on the Riga-Tallinn route.
