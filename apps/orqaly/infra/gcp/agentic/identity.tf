resource "google_service_account" "control_plane" {
  project      = var.project_id
  account_id   = "orqaly-cp-${var.environment}"
  display_name = "Orqaly Agent control plane (${var.environment})"
  description  = "Runtime identity for tenant-scoped Agent control-plane requests."
}

resource "google_service_account" "n8n" {
  project      = var.project_id
  account_id   = "orqaly-n8n-${var.environment}"
  display_name = "Orqaly private n8n (${var.environment})"
  description  = "Connector runner identity; intentionally has no provider-secret or artifact access."
}

resource "google_service_account" "task_invoker" {
  project      = var.project_id
  account_id   = "orqaly-task-${var.environment}"
  display_name = "Orqaly Cloud Tasks invoker (${var.environment})"
  description  = "OIDC identity reserved for a future private execution-kernel handler."
}

resource "google_project_iam_member" "control_plane_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.control_plane.email}"
}

resource "google_project_iam_member" "n8n_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.n8n.email}"
}
