terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.46.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
