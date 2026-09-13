resource "google_cloud_run_v2_service" "control_plane" {
  count = var.deploy_runtime_services ? 1 : 0

  project             = var.project_id
  name                = "${local.name}-control"
  location            = var.region
  description         = "Private Orqaly delegated-Agent control plane"
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = var.cloud_run_deletion_protection
  labels              = local.common_labels

  template {
    service_account                  = google_service_account.control_plane.email
    timeout                          = "300s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = var.control_plane_min_instances
      max_instance_count = var.control_plane_max_instances
    }

    vpc_access {
      egress = "ALL_TRAFFIC"

      network_interfaces {
        network    = local.network_id
        subnetwork = local.subnet_id
        tags       = ["${local.name}-control"]
      }
    }

    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [local.cloud_sql_connection_name]
      }
    }

    containers {
      name  = "control-plane"
      image = var.control_plane_image

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "AGENTIC_EXECUTION_ENABLED"
        value = tostring(var.agentic_execution_enabled)
      }

      env {
        name  = "AGENTIC_CAPABILITIES_JSON"
        value = jsonencode({ executors = [], descriptors = [], connections = [] })
      }

      env {
        name  = "ORQALY_PRINCIPAL_AUDIENCE"
        value = "orqaly-agentic-control-plane"
      }

      env {
        name  = "ORQALY_PRINCIPAL_MAX_TTL_SECONDS"
        value = "300"
      }

      env {
        name  = "HTTP_JSON_LIMIT"
        value = "256kb"
      }

      env {
        name  = "RATE_LIMIT_MAX_REQUESTS"
        value = "120"
      }

      env {
        name  = "RATE_LIMIT_WINDOW_MS"
        value = "60000"
      }

      env {
        name  = "DB_POOL_MAX"
        value = "5"
      }

      env {
        name = "DATABASE_URL"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["control_plane_database_url"].secret_id
            version = var.control_plane_database_url_secret_version
          }
        }
      }

      env {
        name = "ORQALY_PRINCIPAL_SIGNING_KEY"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["principal_signing_key"].secret_id
            version = var.principal_signing_key_secret_version
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 24

        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [
    google_project_iam_member.control_plane_cloud_sql_client,
    google_secret_manager_secret_iam_member.runtime_access,
  ]
}

resource "google_cloud_run_v2_service" "n8n" {
  count = var.deploy_runtime_services ? 1 : 0

  project             = var.project_id
  name                = "${local.name}-n8n"
  location            = var.region
  description         = "Private self-hosted n8n connector runner; not a customer UI"
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = var.cloud_run_deletion_protection
  labels              = local.common_labels

  template {
    service_account                  = google_service_account.n8n.email
    timeout                          = "300s"
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    vpc_access {
      egress = "ALL_TRAFFIC"

      network_interfaces {
        network    = local.network_id
        subnetwork = local.subnet_id
        tags       = ["${local.name}-n8n"]
      }
    }

    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [local.cloud_sql_connection_name]
      }
    }

    containers {
      name  = "n8n"
      image = var.n8n_image

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
        # n8n regular mode may need CPU after request acceptance. min=0 still
        # scales idle capacity to zero, but active instances use instance CPU.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "DB_TYPE"
        value = "postgresdb"
      }

      env {
        name  = "DB_POSTGRESDB_HOST"
        value = "/cloudsql/${local.cloud_sql_connection_name}"
      }

      env {
        name  = "DB_POSTGRESDB_PORT"
        value = "5432"
      }

      env {
        name  = "DB_POSTGRESDB_DATABASE"
        value = var.n8n_database_name
      }

      env {
        name  = "DB_POSTGRESDB_USER"
        value = var.n8n_database_user
      }

      env {
        name = "DB_POSTGRESDB_PASSWORD"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["n8n_database_password"].secret_id
            version = var.n8n_database_password_secret_version
          }
        }
      }

      env {
        name = "N8N_ENCRYPTION_KEY"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["n8n_encryption_key"].secret_id
            version = var.n8n_encryption_key_secret_version
          }
        }
      }

      env {
        name  = "N8N_LISTEN_ADDRESS"
        value = "0.0.0.0"
      }

      env {
        name  = "N8N_PORT"
        value = "8080"
      }

      env {
        name  = "N8N_PROTOCOL"
        value = "https"
      }

      env {
        name  = "N8N_PROXY_HOPS"
        value = "1"
      }

      env {
        name  = "GENERIC_TIMEZONE"
        value = "UTC"
      }

      env {
        name  = "TZ"
        value = "UTC"
      }

      env {
        name  = "EXECUTIONS_MODE"
        value = "regular"
      }

      env {
        name  = "EXECUTIONS_TIMEOUT"
        value = "30"
      }

      env {
        name  = "EXECUTIONS_TIMEOUT_MAX"
        value = "30"
      }

      env {
        name  = "EXECUTIONS_DATA_SAVE_ON_ERROR"
        value = "none"
      }

      env {
        name  = "EXECUTIONS_DATA_SAVE_ON_SUCCESS"
        value = "none"
      }

      env {
        name  = "EXECUTIONS_DATA_SAVE_ON_PROGRESS"
        value = "false"
      }

      env {
        name  = "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS"
        value = "false"
      }

      env {
        name  = "EXECUTIONS_DATA_PRUNE"
        value = "true"
      }

      env {
        name  = "EXECUTIONS_DATA_MAX_AGE"
        value = "24"
      }

      env {
        name  = "EXECUTIONS_DATA_PRUNE_MAX_COUNT"
        value = "1000"
      }

      env {
        name  = "EXECUTIONS_DATA_HARD_DELETE_BUFFER"
        value = "1"
      }

      env {
        name  = "N8N_CONCURRENCY_PRODUCTION_LIMIT"
        value = "1"
      }

      env {
        name  = "N8N_PAYLOAD_SIZE_MAX"
        value = "1"
      }

      env {
        name  = "N8N_BLOCK_ENV_ACCESS_IN_NODE"
        value = "true"
      }

      env {
        name  = "N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES"
        value = "true"
      }

      env {
        name  = "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS"
        value = "true"
      }

      env {
        name  = "N8N_SECURE_COOKIE"
        value = "true"
      }

      env {
        name  = "N8N_SAMESITE_COOKIE"
        value = "strict"
      }

      env {
        name  = "N8N_DIAGNOSTICS_ENABLED"
        value = "false"
      }

      env {
        name  = "N8N_PERSONALIZATION_ENABLED"
        value = "false"
      }

      env {
        name  = "N8N_VERSION_NOTIFICATIONS_ENABLED"
        value = "false"
      }

      env {
        name  = "N8N_TEMPLATES_ENABLED"
        value = "false"
      }

      env {
        name  = "N8N_PUBLIC_API_DISABLED"
        value = "true"
      }

      env {
        name  = "N8N_SSRF_PROTECTION_ENABLED"
        value = "true"
      }

      env {
        name  = "N8N_SSRF_BLOCKED_IP_RANGES"
        value = "default"
      }

      env {
        name  = "N8N_SSRF_ALLOWED_HOSTNAMES"
        value = var.n8n_ssrf_allowed_hostnames
      }

      env {
        name  = "N8N_METRICS"
        value = "false"
      }

      env {
        name  = "N8N_LOG_LEVEL"
        value = "warn"
      }

      env {
        name = "NODES_EXCLUDE"
        value = jsonencode([
          "n8n-nodes-base.code",
          "n8n-nodes-base.executeCommand",
          "n8n-nodes-base.readWriteFile",
          "n8n-nodes-base.ssh",
        ])
      }

      startup_probe {
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 24

        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [
    google_compute_firewall.n8n_deny_other_egress,
    google_project_iam_member.n8n_cloud_sql_client,
    google_secret_manager_secret_iam_member.runtime_access,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "control_plane_invoker" {
  for_each = var.deploy_runtime_services ? var.control_plane_invoker_members : toset([])

  project  = var.project_id
  location = google_cloud_run_v2_service.control_plane[0].location
  name     = google_cloud_run_v2_service.control_plane[0].name
  role     = "roles/run.invoker"
  member   = each.value
}

resource "google_cloud_run_v2_service_iam_member" "n8n_operator_invoker" {
  for_each = var.deploy_runtime_services ? var.n8n_operator_invoker_members : toset([])

  project  = var.project_id
  location = google_cloud_run_v2_service.n8n[0].location
  name     = google_cloud_run_v2_service.n8n[0].name
  role     = "roles/run.invoker"
  member   = each.value
}

# The executable-action Tool Gateway and its two cross-service IAM edges are
# provisioned by the reviewed Preview execution release, not by this older
# foundation state. This module grants no runtime identity automatic n8n
# invocation; the reviewed release alone owns API -> n8n and n8n -> Gateway.
# The main-module check keeps this stack from claiming live execution authority.
# Intentionally absent in this foundation:
# - Tool Gateway and provider-event ingress (externally managed/quarantined)
# - sealed-context Agent/artifact harness
# - disposable sandbox and independent reviewer jobs
# - generic execution-kernel Cloud Tasks target
# Adding any of them requires a separate reviewed module and explicit IAM edges.
