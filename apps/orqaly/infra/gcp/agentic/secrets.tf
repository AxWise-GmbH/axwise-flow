locals {
  runtime_secret_names = {
    control_plane_database_url = "${local.name}-control-plane-database-url"
    principal_signing_key      = "${local.name}-principal-signing-key"
    n8n_database_password      = "${local.name}-n8n-database-password"
    n8n_encryption_key         = "${local.name}-n8n-encryption-key"
  }

  runtime_secret_readers = {
    control_plane_database_url = google_service_account.control_plane.email
    principal_signing_key      = google_service_account.control_plane.email
    n8n_database_password      = google_service_account.n8n.email
    n8n_encryption_key         = google_service_account.n8n.email
  }
}

resource "google_secret_manager_secret" "runtime" {
  for_each = local.runtime_secret_names

  project             = var.project_id
  secret_id           = each.value
  labels              = merge(local.common_labels, { secret-purpose = replace(each.key, "_", "-") })
  deletion_protection = var.secret_deletion_protection

  replication {
    user_managed {
      replicas {
        location = var.secret_location
      }
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each = local.runtime_secret_readers

  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

# No google_secret_manager_secret_version resources are allowed here. Secret
# payloads must enter through the operator bootstrap path and never Terraform.
