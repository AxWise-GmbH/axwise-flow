use axwise_core::simulation::SelectedStakeholder;
use axwise_core::simulation_plan::generate_simulation_plan;

#[test]
fn test_simulation_plan_and_ocean_parity() {
    let stakeholders = vec![SelectedStakeholder {
        id: "ops_manager".to_string(),
        label: "Operations Manager".to_string(),
        description: "Coordinates handoffs".to_string(),
        questions: vec!["How do handoffs happen?".to_string()],
        participants: 2,
        country_code: Some("LV".to_string()),
        locality: Some("Riga".to_string()),
        question_ids: vec![],
    }];

    let seed = 42;
    let operation_id = "ab87256f-665f-5100-b00b-7c0aede36254";

    let slots = generate_simulation_plan(&stakeholders, seed, operation_id)
        .expect("Failed to generate simulation plan");

    assert_eq!(slots.len(), 2);

    // Slot 1
    assert_eq!(slots[0].slot_index, 1);
    assert_eq!(slots[0].participant_id, "418bfb81-fe8c-5fec-ab65-da66888c16ee");
    assert_eq!(slots[0].ocean_micros.openness, 448868);
    assert_eq!(slots[0].ocean_micros.conscientiousness, 491186);
    assert_eq!(slots[0].ocean_micros.extraversion, 616550);
    assert_eq!(slots[0].ocean_micros.agreeableness, 505024);
    assert_eq!(slots[0].ocean_micros.neuroticism, 389734);

    // Slot 2
    assert_eq!(slots[1].slot_index, 2);
    assert_eq!(slots[1].participant_id, "14cd3641-dc5e-5abb-bf3a-2178cf1e07c4");
    assert_eq!(slots[1].ocean_micros.openness, 327547);
    assert_eq!(slots[1].ocean_micros.conscientiousness, 531117);
    assert_eq!(slots[1].ocean_micros.extraversion, 353264);
    assert_eq!(slots[1].ocean_micros.agreeableness, 630137);
    assert_eq!(slots[1].ocean_micros.neuroticism, 372497);

    println!("✅ Simulation plan and OCEAN traits match Python 100%!");
}
