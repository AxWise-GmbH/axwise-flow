"""
Tests for configuration settings.
"""
import os
import sys
import pytest

# Add project root to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from backend.infrastructure.config.settings import Settings

def test_database_config_defaults(monkeypatch):
    """Test default database configuration settings"""
    monkeypatch.setenv("DB_USER", "postgres")
    monkeypatch.setenv("DB_PASSWORD", "postgres")
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "interview_insights")
    # Ensure DATABASE_URL_ENV is not set, so it falls back to constructing from components
    monkeypatch.delenv("DATABASE_URL_ENV", raising=False)

    settings = Settings()
    
    assert isinstance(settings.database_url, str)
    assert settings.db_user == "postgres"
    assert settings.db_host == "localhost"
    assert settings.db_port == 5432
    assert settings.db_name == "interview_insights"
    assert settings.db_pool_size == 5
    assert settings.db_max_overflow == 10
    assert settings.db_pool_timeout == 30

def test_database_config_overrides(monkeypatch):
    """Test that environment variables override default settings"""
    # Set environment variables for PostgreSQL defaults first
    monkeypatch.setenv("DB_USER", "postgres")
    monkeypatch.setenv("DB_PASSWORD", "postgres")
    monkeypatch.setenv("DB_HOST", "localhost")
    # Ensure DATABASE_URL_ENV is not set
    monkeypatch.delenv("DATABASE_URL_ENV", raising=False)

    # Set environment variables to be overridden by the test
    monkeypatch.setenv("DB_PORT", "6432")
    monkeypatch.setenv("DB_POOL_SIZE", "10")
    monkeypatch.setenv("DB_NAME", "test_database")
    
    # Create settings instance with new environment variables
    settings = Settings()
    
    # Assert that environment variables take precedence
    assert settings.db_port == 6432
    assert settings.db_pool_size == 10
    assert settings.db_name == "test_database"
    
    # Other settings should still have default values
    assert settings.db_host == "localhost"
    assert settings.db_user == "postgres"

def test_database_url_construction(monkeypatch):
    """Test that database URL is constructed correctly"""
    monkeypatch.setenv("DB_USER", "postgres")
    monkeypatch.setenv("DB_PASSWORD", "postgres")
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "interview_insights")
    # Ensure DATABASE_URL_ENV is not set
    monkeypatch.delenv("DATABASE_URL_ENV", raising=False)

    settings = Settings()
    
    # The actual password might not be in the URL if not specified for the user in some DBs, 
    # but settings.database_url property includes it if self.DB_PASSWORD is set.
    # For this test, we mainly care it starts with postgresql:// and contains other components.
    expected_url_start = f"postgresql://USER:PASS@HOST:PORT/DB
    assert settings.database_url.startswith("postgresql://")
    assert settings.db_user in settings.database_url # User should be in the URL
    assert settings.db_host in settings.database_url
    assert str(settings.db_port) in settings.database_url
    assert settings.db_name in settings.database_url
    # Check the full constructed URL for a more robust test, assuming password is included
    assert settings.DATABASE_URL=***REDACTED*** f"postgresql://USER:PASS@HOST:PORT/DB
