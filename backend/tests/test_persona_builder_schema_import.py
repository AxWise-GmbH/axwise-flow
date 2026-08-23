from backend.schemas import Persona
from backend.services.processing import persona_builder


def test_persona_builder_uses_canonical_persona_schema():
    assert persona_builder.PersonaSchema is Persona
