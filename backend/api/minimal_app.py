from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()
app = FastAPI()

@app.get("/protected")
async def protected_route(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return {"message": "This is a protected route", "token": credentials.credentials}

@app.get("/unprotected")
async def unprotected_route():
    return {"message": "This is an unprotected route"}