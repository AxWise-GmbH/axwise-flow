use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::simulation::{SelectedStakeholder, SimulationOceanV1};
use crate::wire::{canonical_hash, WireError};

pub const SIMULATION_NAMESPACE: &str = "axwise.simulation.v1";
pub const DEFAULT_SAMPLING_PROFILE: &str = "hash_uniform_v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSlot {
    pub participant_id: String,
    pub stakeholder_id: String,
    pub slot_index: u32,
    pub country_code: Option<String>,
    pub locality: Option<String>,
    pub ocean_micros: SimulationOceanV1,
}

/// Compute a deterministic UUID for a simulation slot/participant.
pub fn bound_uuid(
    kind: &str,
    operation_id: &str,
    stakeholder_id: &str,
    slot_index: u32,
) -> Result<String, WireError> {
    let content = json!({
        "namespace": SIMULATION_NAMESPACE,
        "kind": kind,
        "operationId": operation_id,
        "parts": [stakeholder_id, slot_index],
    });

    let hash_hex = canonical_hash(&content)?;
    let mut bytes = [0u8; 16];
    for (i, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hash_hex[i * 2..i * 2 + 2], 16)
            .map_err(|e| WireError::Serialization(e.to_string()))?;
    }

    // Set UUID v5 bits (version 5: 0x50, variant RFC 4122: 0x80)
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    Ok(Uuid::from_bytes(bytes).to_string())
}

/// Generate deterministic OCEAN personality micros for a specific slot and trait.
pub fn sample_ocean_trait(
    profile_version: &str,
    seed: u64,
    stakeholder_id: &str,
    slot_index: u32,
    trait_name: &str,
) -> Result<u32, WireError> {
    let payload = json!({
        "profile": profile_version,
        "seed": seed,
        "stakeholderId": stakeholder_id,
        "slotIndex": slot_index,
        "trait": trait_name,
    });

    let hash = canonical_hash(&payload)?;
    // Take first 16 hex characters as u64
    let sample = u64::from_str_radix(&hash[..16], 16)
        .map_err(|e| WireError::Serialization(e.to_string()))?;

    // Variability: bounded between 300,000 and 700,000 micros
    let value = 300_000 + (sample % 400_001);
    Ok(value as u32)
}

/// Generate full simulation plan with deterministic participant slots.
pub fn generate_simulation_plan(
    stakeholders: &[SelectedStakeholder],
    seed: u64,
    operation_id: &str,
) -> Result<Vec<SimulationSlot>, WireError> {
    let mut slots = Vec::new();
    let traits = [
        "openness",
        "conscientiousness",
        "extraversion",
        "agreeableness",
        "neuroticism",
    ];

    for stakeholder in stakeholders {
        for index in 1..=stakeholder.participants {
            let openness = sample_ocean_trait(DEFAULT_SAMPLING_PROFILE, seed, &stakeholder.id, index, traits[0])?;
            let conscientiousness = sample_ocean_trait(DEFAULT_SAMPLING_PROFILE, seed, &stakeholder.id, index, traits[1])?;
            let extraversion = sample_ocean_trait(DEFAULT_SAMPLING_PROFILE, seed, &stakeholder.id, index, traits[2])?;
            let agreeableness = sample_ocean_trait(DEFAULT_SAMPLING_PROFILE, seed, &stakeholder.id, index, traits[3])?;
            let neuroticism = sample_ocean_trait(DEFAULT_SAMPLING_PROFILE, seed, &stakeholder.id, index, traits[4])?;

            let ocean_micros = SimulationOceanV1 {
                openness,
                conscientiousness,
                extraversion,
                agreeableness,
                neuroticism,
            };

            let participant_id = bound_uuid("participant", operation_id, &stakeholder.id, index)?;

            slots.push(SimulationSlot {
                participant_id,
                stakeholder_id: stakeholder.id.clone(),
                slot_index: index,
                country_code: stakeholder.country_code.clone(),
                locality: stakeholder.locality.clone(),
                ocean_micros,
            });
        }
    }

    Ok(slots)
}
