resource "google_sql_database_instance" "agentic" {
  count = var.create_cloud_sql_instance ? 1 : 0

  project          = var.project_id
  name             = "${local.name}-pg"
  region           = var.region
  database_version = var.cloud_sql_database_version

  deletion_protection = var.cloud_sql_deletion_protection

  settings {
    tier                  = var.cloud_sql_tier
    edition               = "ENTERPRISE"
    availability_type     = var.cloud_sql_availability_type
    disk_type             = "PD_SSD"
    disk_size             = var.cloud_sql_disk_size_gb
    disk_autoresize       = true
    disk_autoresize_limit = var.cloud_sql_disk_autoresize_limit_gb

    deletion_protection_enabled = var.cloud_sql_deletion_protection
    user_labels                 = local.common_labels

    backup_configuration {
      enabled                        = var.cloud_sql_backups_enabled
      point_in_time_recovery_enabled = var.cloud_sql_backups_enabled && var.cloud_sql_point_in_time_recovery_enabled
      start_time                     = "02:00"
      transaction_log_retention_days = var.cloud_sql_backups_enabled && var.cloud_sql_point_in_time_recovery_enabled ? 7 : null

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = local.network_id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
  }

  depends_on = [
    google_project_service.required,
    google_service_networking_connection.private_services,
  ]

  lifecycle {
    ignore_changes = [settings[0].disk_size]
  }
}

resource "google_sql_database" "agentic" {
  count = var.manage_databases ? 1 : 0

  project         = var.project_id
  name            = var.agentic_database_name
  instance        = local.cloud_sql_instance_name
  charset         = "UTF8"
  deletion_policy = "ABANDON"
}

resource "google_sql_database" "n8n" {
  count = var.manage_databases ? 1 : 0

  project         = var.project_id
  name            = var.n8n_database_name
  instance        = local.cloud_sql_instance_name
  charset         = "UTF8"
  deletion_policy = "ABANDON"
}

# Database roles and passwords are intentionally absent. Bootstrap distinct,
# least-privilege users outside Terraform after the empty databases exist.
