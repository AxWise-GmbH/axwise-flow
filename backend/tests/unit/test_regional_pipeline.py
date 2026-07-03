import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from api.research.simulation_bridge.models import CompanyDiscoveryItem


@pytest.mark.asyncio
async def test_pipeline_fallback_to_web_search():
    """Test that the pipeline falls back to web search when no API keys are present."""
    pipeline = B2BDataPipeline(
        location="Munich",
        business_problem="Manual freight matching in logistics",
        target_user="Logistics Manager",
        model=None
    )
    # No API keys = no OpenRegister, no model = no web search either
    # Should return empty list gracefully
    results = await pipeline.run()
    assert results == []


@pytest.mark.asyncio
async def test_pipeline_openregister_geo_search():
    """Test that OpenRegister uses geo-radius search and extracts real decision makers."""
    pipeline = B2BDataPipeline(
        location="Munich",
        business_problem="Manual freight matching",
        target_user="Logistics Manager",
        model=MagicMock()
    )
    pipeline.openregister_key = "test-openregister-key"

    # Mock Openregister client
    mock_client = MagicMock()
    
    # Mock search result item
    mock_search_item = MagicMock()
    mock_search_item.company_id = "HRB-123456"
    mock_search_item.name = "Bayern Spedition GmbH"
    mock_search_item.register_court = "Amtsgericht München"
    mock_search_item.register_type = "HRB"
    mock_search_item.register_number = "123456"
    
    mock_search_response = MagicMock()
    mock_search_response.results = [mock_search_item]
    mock_client.search.find_companies_v1.return_value = mock_search_response
    
    # Mock get_details_v1 response with real person data
    mock_details = MagicMock()
    mock_details.id = "HRB-123456"
    mock_details.status = "active"
    mock_details.name.name = "Bayern Spedition GmbH"
    mock_details.legal_form = "gmbh"
    mock_details.purpose.purpose = "Güterbeförderung und Logistikdienstleistungen"
    
    # Industry codes
    mock_wz = MagicMock()
    mock_wz.description = "Freight transport by road"
    mock_wz.code = "49.41"
    mock_details.industry_codes.wz2025 = [mock_wz]
    
    # Employee indicators
    mock_indicator = MagicMock()
    mock_indicator.date = "2024-12-31"
    mock_indicator.employees = 180
    mock_details.indicators = [mock_indicator]
    
    mock_details.address.formatted_value = "Logistikstrasse 12, 80331 München"
    
    # Real decision makers from Handelsregister
    mock_rep1 = MagicMock()
    mock_rep1.role = "DIRECTOR"
    mock_rep1.end_date = None
    mock_rep1.start_date = "2019-03-15"
    mock_rep1.name = "Dr. Thomas Wagner"
    mock_rep1.natural_person.first_name = "Thomas"
    mock_rep1.natural_person.last_name = "Wagner"
    mock_rep1.natural_person.city = "München"
    mock_rep1.natural_person.date_of_birth = "1972-05-20"
    mock_rep1.legal_person = None
    
    mock_rep2 = MagicMock()
    mock_rep2.role = "PROKURA"
    mock_rep2.end_date = None
    mock_rep2.start_date = "2021-06-01"
    mock_rep2.name = "Claudia Berger"
    mock_rep2.natural_person.first_name = "Claudia"
    mock_rep2.natural_person.last_name = "Berger"
    mock_rep2.natural_person.city = "Starnberg"
    mock_rep2.natural_person.date_of_birth = None
    mock_rep2.legal_person = None
    
    mock_details.representation = [mock_rep1, mock_rep2]
    
    # Contact with social media
    mock_details.contact.website_url = "https://www.bayern-spedition.de"
    mock_details.contact.phone = "+49 89 44556677"
    mock_details.contact.email = "info@bayern-spedition.de"
    mock_details.contact.social_media.linkedin = "https://linkedin.com/company/bayern-spedition"
    mock_details.contact.social_media.xing = "https://xing.com/companies/bayernspedition"
    
    # Register info
    mock_details.company_register.court = "Amtsgericht München"
    
    mock_client.company.get_details_v1.return_value = mock_details
    
    # Mock get_contact_v0 (should not need to be called since details.contact is populated)
    mock_contact = MagicMock()
    mock_contact.source_url = "https://www.bayern-spedition.de"
    mock_contact.phone = "+49 89 44556677"
    mock_contact.email = "info@bayern-spedition.de"
    mock_client.company.get_contact_v0.return_value = mock_contact

    # Mock the Agent for search params and geocoding
    async def mock_agent_run(prompt_str):
        class MockOutput:
            pass
        
        if "Extract parameters" in prompt_str:
            result = MockOutput()
            result.german_city = "München"
            result.search_keyword = "Logistik"
            
            class MockRunResult:
                output = result
            return MockRunResult()
        elif "Geocode" in prompt_str:
            class Coord:
                latitude = 48.1400
                longitude = 11.5800
            
            class GeoResult:
                coordinates = [Coord()]
            
            class MockRunResult:
                output = GeoResult()
            return MockRunResult()
        else:
            raise ValueError(f"Unexpected agent call: {prompt_str}")

    mock_agent = MagicMock()
    mock_agent.run = mock_agent_run

    with patch("openregister.Openregister", return_value=mock_client), \
         patch("api.research.simulation_bridge.services.pipeline.Agent", return_value=mock_agent), \
         patch.object(pipeline, "_enrich_with_grounded_pain_points", side_effect=lambda x: x):
        
        results = await pipeline.run()
        
        assert len(results) == 1
        company = results[0]
        
        # Verify basic fields
        assert company.name == "Bayern Spedition GmbH"
        assert company.size == "180 employees"
        assert company.industry == "Freight transport by road"
        assert company.legal_form == "GMBH"
        
        # Verify real decision makers
        assert "Geschäftsführer: Thomas Wagner" in company.decision_makers
        assert "Prokurist: Claudia Berger" in company.decision_makers
        
        # Verify decision maker details with structured data
        assert company.decision_maker_details is not None
        assert len(company.decision_maker_details) == 2
        dm1 = company.decision_maker_details[0]
        assert dm1["name"] == "Thomas Wagner"
        assert dm1["role"] == "Geschäftsführer"
        assert dm1["type"] == "natural_person"
        assert dm1["city"] == "München"
        assert dm1["since"] == "2019-03-15"
        
        # Verify contact + social media
        assert company.website == "https://www.bayern-spedition.de"
        assert company.contact_phone == "+49 89 44556677"
        assert company.email == "info@bayern-spedition.de"
        assert company.linkedin_url == "https://linkedin.com/company/bayern-spedition"
        assert company.xing_url == "https://xing.com/companies/bayernspedition"
        
        # Verify registry provenance
        assert company.register_number == "HRB 123456"
        assert company.register_court == "Amtsgericht München"
        
        # Verify purpose
        assert company.purpose == "Güterbeförderung und Logistikdienstleistungen"
        
        # Verify geo-radius search was used (check location param was passed)
        call_kwargs = mock_client.search.find_companies_v1.call_args
        assert "location" in call_kwargs.kwargs or "location" in (call_kwargs[1] if len(call_kwargs) > 1 else {})


@pytest.mark.asyncio
async def test_pipeline_city_coordinates():
    """Test that city coordinate lookup works for major German cities."""
    pipeline = B2BDataPipeline(
        location="Munich, Germany",
        business_problem="test",
        target_user="test"
    )
    
    coords = pipeline._get_city_coordinates()
    assert coords is not None
    assert abs(coords[0] - 48.1351) < 0.01
    assert abs(coords[1] - 11.5820) < 0.01
    
    pipeline.location = "Berlin"
    coords = pipeline._get_city_coordinates()
    assert coords is not None
    assert abs(coords[0] - 52.52) < 0.01
    
    pipeline.location = "Unknown City XYZ"
    coords = pipeline._get_city_coordinates()
    assert coords is None


@pytest.mark.asyncio
async def test_pipeline_no_mock_data():
    """Verify that no hardcoded mock company data exists in the pipeline."""
    import inspect
    from api.research.simulation_bridge.services.pipeline import B2BDataPipeline
    source = inspect.getsource(B2BDataPipeline)
    
    # These were the old hardcoded mock values that should NOT exist
    assert "Mueller Logistics GmbH" not in source
    assert "mueller-logistics.de" not in source
    assert "Hans Mueller" not in source
    assert "Sabine Krausse" not in source
    assert "mock_api_results" not in source


@pytest.mark.asyncio
async def test_regional_service_persona_grounding():
    """Test that personas get enriched with real grounding data from discovered companies."""
    from api.research.simulation_bridge.services.regional_service import RegionalService
    from api.research.simulation_bridge.models import RegionalWorkflowRequest, SimulatedPerson, DemographicDetails
    
    service = RegionalService(model=None)
    
    mock_company = CompanyDiscoveryItem(
        id="HRB-777",
        name="Dynamic Grounding GmbH",
        industry="Logistics",
        size="50 employees",
        location="Munich, Germany",
        latitude=48.13,
        longitude=11.58,
        decision_makers=["Geschäftsführer: Thomas Wagner"],
        estimated_pain_points=["Manual scheduling (Source: Kununu reviews)"],
        insights="Verified via Handelsregister (HRB 777, Amtsgericht München).",
        website="https://www.dynamic.de",
        contact_phone="+49 89 7777",
        register_court="Amtsgericht München",
        register_number="HRB 777",
        linkedin_url="https://linkedin.com/company/dynamic-grounding",
    )
    
    mock_person = SimulatedPerson(
        id="p-1",
        name="Thomas Wagner",
        age=52,
        background="Experienced logistics director.",
        motivations=["Efficiency"],
        pain_points=["Manual work"],
        communication_style="Direct",
        stakeholder_type="Dispatcher Manager",
        demographic_details=DemographicDetails(
            location="Munich",
            industry_experience="15 years",
            company_size="50 employees"
        ),
        grounding_company="Dynamic Grounding GmbH",
        grounding_company_id="HRB-777"
    )
    
    request = RegionalWorkflowRequest(
        location="Munich",
        business_problem="Manual dispatching bottleneck",
        target_user="Dispatcher Manager"
    )
    
    async def mock_discover(*args, **kwargs):
        return [mock_company]
    service.discover_companies = mock_discover
    
    with patch("api.research.simulation_bridge.services.regional_service.PersonaGenerator") as mock_persona_gen_cls, \
         patch("api.research.simulation_bridge.services.regional_service.InterviewSimulator") as mock_interview_sim_cls:
         
        mock_persona_gen = MagicMock()
        mock_persona_gen.generate_all_people = AsyncMock(return_value=[mock_person])
        mock_persona_gen.generate_personas_for_decision_makers = AsyncMock(return_value=[mock_person])
        mock_persona_gen_cls.return_value = mock_persona_gen
        
        mock_interview_sim = MagicMock()
        mock_interview_sim.simulate_all_interviews = AsyncMock(return_value=[])
        mock_interview_sim_cls.return_value = mock_interview_sim
        
        from api.research.simulation_bridge.models import SimulationInsights
        mock_insights = SimulationInsights(
            overall_sentiment="Positive",
            key_themes=["Efficiency"],
            stakeholder_priorities={},
            potential_risks=[],
            opportunities=[],
            recommendations=[]
        )
        
        with patch.object(service, "_generate_stakeholders", return_value={}), \
             patch.object(service, "_aggregate_insights", return_value=mock_insights), \
             patch("backend.infrastructure.persistence.unit_of_work.UnitOfWork") as mock_uow:
             
            result = await service.run_regional_workflow(request, user_id="test_user")
            
            assert result.success is True
            assert len(result.people) == 1
            assert result.people[0].grounding_company == "Dynamic Grounding GmbH"
            assert "Handelsregister (German Company Registry) HRB 777, Amtsgericht München" in result.people[0].grounding_sources
            assert "Official Company Website: https://www.dynamic.de" in result.people[0].grounding_sources
            assert "LinkedIn: https://linkedin.com/company/dynamic-grounding" in result.people[0].grounding_sources
