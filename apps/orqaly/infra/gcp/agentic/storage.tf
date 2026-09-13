resource "google_artifact_registry_repository" "runtime" {
  project       = var.project_id
  location      = var.region
  repository_id = "${local.name}-images"
  description   = "Digest-pinned Orqaly Agent runtime images"
  format        = "DOCKER"
  mode          = "STANDARD_REPOSITORY"
  labels        = local.common_labels

  cleanup_policy_dry_run = true

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "artifacts" {
  project                     = var.project_id
  name                        = local.artifact_bucket_name
  location                    = var.artifact_bucket_location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.artifact_bucket_force_destroy
  labels                      = local.common_labels

  versioning {
    enabled = true
  }

  retention_policy {
    retention_period = var.artifact_retention_seconds
    is_locked        = false
  }

  depends_on = [google_project_service.required]
}

# No runtime identity receives bucket access in this slice. The future Artifact
# Gateway must authorize one exact object/generation before it receives IAM.
