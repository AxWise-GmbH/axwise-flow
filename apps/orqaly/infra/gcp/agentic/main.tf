data "google_project" "current" {
  project_id = var.project_id
}

locals {
  name = "${var.resource_prefix}-${var.environment}"

  common_labels = merge(
    {
      application = "orqaly-agentic"
      environment = var.environment
      managed-by  = "terraform"
    },
    var.labels,
  )

  required_apis = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudtasks.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ])

  network_id = var.create_network ? one(google_compute_network.agentic[*].id) : var.existing_network_id
  subnet_id  = var.create_network ? one(google_compute_subnetwork.runtime[*].id) : var.existing_subnetwork_id

  cloud_sql_instance_name = var.create_cloud_sql_instance ? one(google_sql_database_instance.agentic[*].name) : var.existing_cloud_sql_instance_name
  cloud_sql_connection_name = var.create_cloud_sql_instance ? one(
    google_sql_database_instance.agentic[*].connection_name
  ) : var.existing_cloud_sql_connection_name

  artifact_bucket_name = coalesce(var.artifact_bucket_name, "${var.project_id}-${var.resource_prefix}-artifacts")
  sql_destination_cidrs = var.create_network ? [
    var.private_service_access_cidr
  ] : var.existing_sql_private_ip_cidrs
}

resource "google_project_service" "required" {
  for_each = local.required_apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

check "network_mode_is_complete" {
  assert {
    condition = var.create_network || (
      var.existing_network_id != null &&
      var.existing_subnetwork_id != null
    )
    error_message = "existing_network_id and existing_subnetwork_id are required when create_network is false."
  }
}

check "cloud_sql_mode_is_complete" {
  assert {
    condition = var.create_cloud_sql_instance || (
      var.existing_cloud_sql_instance_name != null &&
      var.existing_cloud_sql_connection_name != null
    )
    error_message = "Existing Cloud SQL instance and connection names are required when create_cloud_sql_instance is false."
  }
}

check "existing_cloud_sql_uses_existing_network" {
  assert {
    condition     = var.create_cloud_sql_instance || !var.create_network
    error_message = "A reused Cloud SQL instance must use its already connected VPC; set create_network=false and provide that VPC/subnet."
  }
}

check "n8n_has_sql_egress_when_deployed" {
  assert {
    condition     = !var.deploy_runtime_services || length(local.sql_destination_cidrs) > 0
    error_message = "At least one existing_sql_private_ip_cidrs entry is required to deploy n8n on an existing VPC."
  }
}

check "runtime_images_are_immutable" {
  assert {
    condition = !var.deploy_runtime_services || (
      can(regex("(?:\\.pkg\\.dev|gcr\\.io)/.+@sha256:[0-9a-f]{64}$", var.control_plane_image)) &&
      can(regex("(?:\\.pkg\\.dev|gcr\\.io)/.+@sha256:[0-9a-f]{64}$", var.n8n_image))
    )
    error_message = "Runtime images must be Artifact Registry/GCR references pinned by sha256 digest."
  }
}

check "artifact_bucket_name_is_valid" {
  assert {
    condition = (
      length(local.artifact_bucket_name) >= 3 &&
      length(local.artifact_bucket_name) <= 63 &&
      can(regex("^[a-z0-9][a-z0-9._-]*[a-z0-9]$", local.artifact_bucket_name))
    )
    error_message = "artifact_bucket_name (including the derived default) must be a valid 3-63 character GCS bucket name."
  }
}

check "database_names_are_separate" {
  assert {
    condition     = var.agentic_database_name != var.n8n_database_name
    error_message = "The canonical Agent database and n8n implementation database must have different names."
  }
}

check "control_plane_scaling_is_valid" {
  assert {
    condition     = var.control_plane_min_instances <= var.control_plane_max_instances
    error_message = "control_plane_min_instances cannot exceed control_plane_max_instances."
  }
}

check "execution_requires_explicit_runtime_enablement" {
  assert {
    condition     = !var.agentic_execution_enabled || var.deploy_runtime_services
    error_message = "agentic_execution_enabled cannot be true while runtime services are disabled."
  }
}

check "execution_gateway_is_externally_managed" {
  assert {
    condition     = !var.agentic_execution_enabled
    error_message = "This foundation does not own the Tool Gateway or its API -> n8n and n8n -> Gateway IAM edges. Keep agentic_execution_enabled=false and use the reviewed Preview execution release so Terraform cannot claim a partial live boundary."
  }
}
