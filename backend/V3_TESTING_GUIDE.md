# 🧪 V3 Research API Testing Guide

This guide shows you how to test the V3 Research API we've built.

## 📋 Quick Start

### 1. Run Structure Tests (No API Keys Required)

Test the code structure and models without making LLM calls:

```bash
cd backend
python test_v3_api_integration.py
```

This tests:
- ✅ Enhanced Pydantic models
- ✅ Service structure and initialization
- ✅ API endpoint structure
- ✅ V1 compatibility features
- ✅ Error handling patterns

### 2. Set Up Environment (For Full Testing)

Create a `.env` file in the backend directory:

```bash
***REMOVED***
GEMINI_API_KEY=***REMOVED***

***REMOVED*** (if using)
DATABASE_URL=***REDACTED***

# Authentication (if using)
SECRET_KEY=your_secret_key_here

# Optional: Logging
LOG_LEVEL=INFO
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Start the FastAPI Server

```bash
uvicorn main:app --reload --port 8000
```

### 5. Test API Endpoints

In another terminal:

```bash
python test_v3_api_endpoints.py
```

## 🔍 What Each Test Does

### Structure Tests (`test_v3_api_integration.py`)

1. **Enhanced Models Test**
   - Creates BusinessContext, UserIntent, IndustryAnalysis models
   - Validates field validation and auto-population
   - Tests completeness scoring

2. **Master Research Service Test**
   - Tests service configuration
   - Validates metrics structure
   - Checks component initialization

3. **Response Orchestration Test**
   - Tests response types and contexts
   - Validates response metrics calculation
   - Checks template system

4. **Performance Optimization Test**
   - Tests cache strategies
   - Validates performance metrics
   - Checks optimization configuration

5. **API Structure Test**
   - Validates API endpoint definitions
   - Checks request/response models
   - Tests feature flags

6. **V1 Compatibility Test**
   - Validates V1 compatibility methods
   - Checks fallback mechanisms
   - Tests conversion functions

### API Endpoint Tests (`test_v3_api_endpoints.py`)

1. **Health Endpoint** (`GET /api/research/v3/health`)
   - Tests basic connectivity
   - Validates service status
   - Checks feature availability

2. **Chat Endpoint** (`POST /api/research/v3/chat`)
   - Tests enhanced analysis mode
   - Validates V1 compatibility mode
   - Checks response structure

3. **Analysis Endpoint** (`POST /api/research/v3/analyze`)
   - Tests direct analysis functionality
   - Validates comprehensive analysis
   - Checks performance metrics

4. **Metrics Endpoint** (`GET /api/research/v3/metrics`)
   - Tests performance monitoring
   - Validates metrics collection
   - Checks service health

5. **Error Handling**
   - Tests invalid request handling
   - Validates error responses
   - Checks graceful degradation

## 🎯 Testing Scenarios

### Scenario 1: Basic Functionality (No LLM)

```bash
# Test structure only
python test_v3_api_integration.py

# Start server
uvicorn main:app --reload

# Test health endpoint
curl http://localhost:8000/api/research/v3/health
```

### Scenario 2: Full V3 Analysis (With LLM)

```bash
# Set GEMINI_API_KEY in .env
echo "GEMINI_API_KEY=***REMOVED***" >> .env

# Run full endpoint tests
python test_v3_api_endpoints.py
```

### Scenario 3: V1 Compatibility Testing

```bash
# Test V1 compatibility mode
curl -X POST http://localhost:8000/api/research/v3/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"id": "1", "content": "Hi", "role": "user", "timestamp": "2024-01-01T10:00:00Z"}],
    "input": "I have a business idea",
    "v1_compatibility_mode": true
  }'
```

### Scenario 4: Performance Testing

```bash
# Check metrics
curl http://localhost:8000/api/research/v3/metrics

# Test parallel processing
curl -X POST http://localhost:8000/api/research/v3/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [],
    "input": "Test parallel processing",
    "enable_parallel_processing": true,
    "enable_enhanced_analysis": true
  }'
```

## 🔧 Troubleshooting

### Common Issues

1. **Import Errors**
   ```bash
   # Make sure you're in the backend directory
   cd backend
   
   # Check Python path
   export PYTHONPATH=$PYTHONPATH:$(pwd)
   ```

2. **Missing Dependencies**
   ```bash
   pip install fastapi uvicorn pydantic instructor google-genai
   ```

3. **API Key Issues**
   ```bash
   # Check if API key is set
   echo $GEMINI_API_KEY
   
   # Or check .env file
   cat .env
   ```

4. **Server Not Starting**
   ```bash
   # Check if port is available
   lsof -i :8000
   
   # Try different port
   uvicorn main:app --reload --port 8001
   ```

5. **Database Issues**
   ```bash
   # For SQLite (default)
   rm test.db  # Reset database
   
   # Check database connection
   python -c "from database import get_db; print('DB OK')"
   ```

### Debug Mode

Enable verbose logging:

```bash
export LOG_LEVEL=DEBUG
python test_v3_api_integration.py
```

## 📊 Expected Results

### Successful Structure Test Output:
```
🧪 V3 Research API Integration Test Suite
======================================================================
✅ PASS Enhanced Models
✅ PASS Master Research Service  
✅ PASS Response Orchestration
✅ PASS Performance Optimization
✅ PASS API Structure
✅ PASS V1 Compatibility
✅ PASS Error Handling

🎯 Overall Results: 7/7 tests passed
🎉 All integration tests passed!
```

### Successful API Test Output:
```
🧪 V3 Research API Endpoint Tests
======================================================================
✅ PASS Health Endpoint
✅ PASS Chat Endpoint (Basic)
✅ PASS Chat Endpoint (V1 Compatibility)
✅ PASS Analysis Endpoint
✅ PASS Metrics Endpoint
✅ PASS Error Handling

🎯 Overall Results: 6/6 tests passed
🎉 All API tests passed!
```

## 🚀 Next Steps After Testing

1. **Production Deployment**
   - Set up proper environment variables
   - Configure database connections
   - Set up monitoring and logging

2. **Integration Testing**
   - Test with real frontend applications
   - Validate session management
   - Test concurrent users

3. **Performance Optimization**
   - Monitor response times
   - Optimize cache settings
   - Tune parallel processing

4. **Monitoring Setup**
   - Set up health check monitoring
   - Configure performance alerts
   - Track usage metrics

## 📖 API Documentation

Once the server is running, visit:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/api/research/v3/health
- **Metrics**: http://localhost:8000/api/research/v3/metrics

## 🎯 Testing Checklist

- [ ] Structure tests pass
- [ ] API server starts successfully
- [ ] Health endpoint responds
- [ ] Chat endpoint works (basic mode)
- [ ] Chat endpoint works (V1 compatibility)
- [ ] Analysis endpoint works
- [ ] Metrics endpoint works
- [ ] Error handling works
- [ ] Performance is acceptable
- [ ] V1 compatibility verified

## 💡 Tips

1. **Start Simple**: Run structure tests first before API tests
2. **Check Logs**: Monitor server logs for detailed error information
3. **Use Postman**: Import the API endpoints for manual testing
4. **Test Incrementally**: Test one endpoint at a time if issues arise
5. **Monitor Performance**: Check response times and resource usage

The V3 Research API is designed to be robust and well-tested. These tests ensure all components work correctly both individually and together.
