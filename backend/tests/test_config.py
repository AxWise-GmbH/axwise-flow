"""
Tests for configuration settings.
"""
import os
import sys
import pytest

# Add project root to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from infrastructure.config.settings import Settings

def test_database_config_defaults():
    """Test default database configuration settings"""
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
    # Set environment variables
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

def test_database_url_construction():
    """Test that database URL is constructed correctly"""
    settings = Settings()
    
    expected_url = f"postgresql://{settings.db_user}@{settings.db_host}:{settings.db_port}/{settings.db_name}"
    assert settings.database_url.startswith("postgresql://")
    
    # Check if all components are in the URL
    assert settings.db_host in settings.database_url
    assert str(settings.db_port) in settings.database_url
    assert settings.db_name in settings.database_url
