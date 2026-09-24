"""Small, dependency-free PEP 517 backend for the allowlisted AxWise source."""
from pathlib import Path
from build import build_wheel_file, build_source_archive


def get_requires_for_build_wheel(config_settings=None):
    return []


def get_requires_for_build_sdist(config_settings=None):
    return []


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    return build_wheel_file(Path.cwd(), Path(wheel_directory)).name


def build_sdist(sdist_directory, config_settings=None):
    return build_source_archive(Path.cwd(), Path(sdist_directory)).name
