# Design Thinking Agent AI - Backend

This is the backend service for the Design Thinking Agent AI application. It provides API endpoints for persona generation, interview analysis, and other design thinking tools.

## Getting Started

### Prerequisites

- Python 3.11
- Virtual environment (venv_py311)

### Installation

1. Create and activate the virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up environment variables:

Create a `.env` file in the backend directory with the following variables:

```
DATABASE_URL=***REDACTED***  # For Mac
# DATABASE_URL=***REDACTED***  # For Windows
GEMINI_API_KEY=***REMOVED***
```

### Running the Server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Project Structure

- `main.py`: FastAPI application entry point
- `routes/`: API route definitions
- `services/`: Business logic services
  - `llm/`: LLM service implementations
  - `processing/`: Data processing services
- `schemas.py`: Pydantic models for request/response validation
- `database.py`: Database connection and models
- `utils/`: Utility functions

## Key Components

### Persona Formation Pipeline

The persona formation pipeline consists of three main components:

1. **TranscriptStructuringService**: Converts raw text into structured JSON representing speaker turns.
2. **AttributeExtractor**: Extracts persona attributes from structured text using LLM.
3. **PersonaBuilder**: Builds persona objects from attributes.

#### Recent Enhancements

The PersonaBuilder has been enhanced to support simplified attribute structures, making it more flexible and robust:

- **Simplified Attribute Format**: Trait fields can now be provided as direct string values rather than nested dictionaries.
- **Key Quotes Handling**: The `key_quotes` field can be provided as a list of strings, which are used as evidence.
- **Overall Confidence Score**: The `overall_confidence_score` field is used to set the confidence for all traits.
- **Robust Error Handling**: Non-string values are safely converted to strings, and missing fields get default values.

For more details, see the [PersonaBuilder documentation](docs/persona_builder.md).

## API Endpoints

### Persona Generation

- `POST /api/personas/generate`: Generate personas from interview text
- `GET /api/personas`: Get all personas
- `GET /api/personas/{persona_id}`: Get a specific persona

### Interview Analysis

- `POST /api/interviews/analyze`: Analyze interview text
- `GET /api/interviews`: Get all interviews
- `GET /api/interviews/{interview_id}`: Get a specific interview

## Testing

Run the tests with:

```bash
# Unit tests
python -m pytest tests/

# Manual tests
python test_persona_builder_manual.py
python test_persona_pipeline_integration.py
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Submit a pull request

## License

This project is proprietary and confidential.
