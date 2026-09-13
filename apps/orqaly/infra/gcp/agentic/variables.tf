variable "project_id" {
  description = "GCP project that owns the Agentic Preview resources."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid GCP project ID."
  }
}

variable "region" {
  description = "GCP region for regional runtime and database resources."
  type        = string
  default     = "europe-west1"
}

variable "environment" {
  description = "Short environment label used in names and labels."
  type        = string
  default     = "preview"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,10}[a-z0-9]$", var.environment))
    error_message = "environment must be 2-12 lowercase letters, numbers or hyphens."
  }
}

variable "resource_prefix" {
  description = "Name prefix for resources created by this module."
  type        = string
  default     = "orqaly-agentic"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,33}[a-z0-9]$", var.resource_prefix))
    error_message = "resource_prefix must be 3-35 lowercase letters, numbers or hyphens."
  }
}

variable "labels" {
  description = "Additional GCP labels. Values must already satisfy GCP label rules."
  type        = map(string)
  default     = {}
}

variable "create_network" {
  description = "Create a dedicated VPC, subnet and private-services connection. Set false to use an already prepared VPC."
  type        = bool
  default     = true
}

variable "existing_network_id" {
  description = "Full network resource ID when create_network is false."
  type        = string
  default     = null
  nullable    = true
}

variable "existing_subnetwork_id" {
  description = "Full regional subnetwork resource ID when create_network is false."
  type        = string
  default     = null
  nullable    = true
}

variable "runtime_subnet_cidr" {
  description = "CIDR for the dedicated Direct VPC egress subnet."
  type        = string
  default     = "10.72.0.0/24"

  validation {
    condition     = can(cidrhost(var.runtime_subnet_cidr, 1))
    error_message = "runtime_subnet_cidr must be a valid CIDR."
  }
}

variable "private_service_access_cidr" {
  description = "CIDR reserved for managed services when create_network is true."
  type        = string
  default     = "10.73.0.0/16"

  validation {
    condition     = can(cidrhost(var.private_service_access_cidr, 1))
    error_message = "private_service_access_cidr must be a valid CIDR."
  }
}

variable "existing_sql_private_ip_cidrs" {
  description = "Cloud SQL private IP CIDRs allowed from n8n when an existing VPC is used."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.existing_sql_private_ip_cidrs : can(cidrhost(cidr, 1))])
    error_message = "Every existing_sql_private_ip_cidrs entry must be a valid CIDR."
  }
}

variable "create_cloud_sql_instance" {
  description = "Create a new, empty Cloud SQL PostgreSQL instance. Set false to reuse an existing instance."
  type        = bool
  default     = true
}

variable "existing_cloud_sql_instance_name" {
  description = "Existing Cloud SQL instance name, required when create_cloud_sql_instance is false."
  type        = string
  default     = null
  nullable    = true
}

variable "existing_cloud_sql_connection_name" {
  description = "Existing Cloud SQL connection name (project:region:instance), required when create_cloud_sql_instance is false."
  type        = string
  default     = null
  nullable    = true
}

variable "manage_databases" {
  description = "Create the two empty logical databases. Set false when they already exist on a reused instance."
  type        = bool
  default     = true
}

variable "cloud_sql_database_version" {
  description = "Cloud SQL PostgreSQL engine version for a newly created instance."
  type        = string
  default     = "POSTGRES_17"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier. The default is a low-cost, non-production Preview tier."
  type        = string
  default     = "db-f1-micro"
}

variable "cloud_sql_availability_type" {
  description = "ZONAL is the lower-cost Preview default; use REGIONAL only after reviewing the added cost."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.cloud_sql_availability_type)
    error_message = "cloud_sql_availability_type must be ZONAL or REGIONAL."
  }
}

variable "cloud_sql_disk_size_gb" {
  description = "Initial Cloud SQL SSD size in GiB."
  type        = number
  default     = 10

  validation {
    condition     = var.cloud_sql_disk_size_gb >= 10
    error_message = "cloud_sql_disk_size_gb must be at least 10."
  }
}

variable "cloud_sql_disk_autoresize_limit_gb" {
  description = "Hard upper bound for automatic Cloud SQL disk growth."
  type        = number
  default     = 100

  validation {
    condition     = var.cloud_sql_disk_autoresize_limit_gb >= var.cloud_sql_disk_size_gb
    error_message = "cloud_sql_disk_autoresize_limit_gb must be at least cloud_sql_disk_size_gb."
  }
}

variable "cloud_sql_deletion_protection" {
  description = "Enable both Terraform and Cloud SQL API deletion protection."
  type        = bool
  default     = true
}

variable "cloud_sql_backups_enabled" {
  description = "Enable automated backups on a newly created instance."
  type        = bool
  default     = true
}

variable "cloud_sql_point_in_time_recovery_enabled" {
  description = "Enable point-in-time recovery. This adds transaction-log storage cost."
  type        = bool
  default     = true
}

variable "agentic_database_name" {
  description = "Canonical Agent control-plane database name."
  type        = string
  default     = "orqaly_agentic"
}

variable "n8n_database_name" {
  description = "Separate n8n implementation database name."
  type        = string
  default     = "n8n_agentic"
}

variable "n8n_database_user" {
  description = "Pre-created least-privilege PostgreSQL username for n8n. Terraform never stores its password."
  type        = string
  default     = "n8n_runtime"
}

variable "artifact_bucket_name" {
  description = "Globally unique artifact bucket name. Null derives one from the globally unique project ID."
  type        = string
  default     = null
  nullable    = true
}

variable "artifact_bucket_location" {
  description = "GCS location for immutable Agent artifacts."
  type        = string
  default     = "EU"
}

variable "artifact_retention_seconds" {
  description = "Minimum object retention. This policy is deliberately not locked by Terraform."
  type        = number
  default     = 604800

  validation {
    condition     = var.artifact_retention_seconds >= 86400
    error_message = "artifact_retention_seconds must be at least one day."
  }
}

variable "artifact_bucket_force_destroy" {
  description = "Permit Terraform to delete a non-empty artifact bucket. Keep false outside disposable tests."
  type        = bool
  default     = false
}

variable "secret_location" {
  description = "User-managed Secret Manager replica location."
  type        = string
  default     = "europe-west1"
}

variable "secret_deletion_protection" {
  description = "Prevent Terraform from destroying runtime secret containers."
  type        = bool
  default     = true
}

variable "deploy_runtime_services" {
  description = "Deploy private Cloud Run services. Keep false until database users, secret versions and digest-pinned images exist."
  type        = bool
  default     = false
}

variable "control_plane_image" {
  description = "Artifact Registry/GCR digest reference for the Agent control plane. Required when deploy_runtime_services is true."
  type        = string
  default     = ""
}

variable "n8n_image" {
  description = "Artifact Registry/GCR digest reference for the mirrored n8n 2.37.10 image. Required when deploy_runtime_services is true."
  type        = string
  default     = ""
}

variable "n8n_ssrf_allowed_hostnames" {
  description = "Exact comma-separated metadata and private Tool Gateway host allowlist for the pinned n8n workflow."
  type        = string
  default     = "metadata.google.internal,orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app"

  validation {
    condition = var.n8n_ssrf_allowed_hostnames == (
      "metadata.google.internal,orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app"
    )
    error_message = "The Preview n8n SSRF allowlist must contain only metadata.google.internal and the exact private Tool Gateway hostname."
  }
}

variable "control_plane_min_instances" {
  description = "Minimum Agent control-plane instances. Preview defaults to scale-to-zero."
  type        = number
  default     = 0

  validation {
    condition     = var.control_plane_min_instances >= 0
    error_message = "control_plane_min_instances cannot be negative."
  }
}

variable "control_plane_max_instances" {
  description = "Hard Agent control-plane instance cap."
  type        = number
  default     = 2

  validation {
    condition     = var.control_plane_max_instances >= 1
    error_message = "control_plane_max_instances must be at least 1."
  }
}

variable "cloud_run_deletion_protection" {
  description = "Prevent Terraform from deleting Cloud Run services."
  type        = bool
  default     = true
}

variable "agentic_execution_enabled" {
  description = "Live dispatch feature flag. Keep false until every runtime/security release gate is met."
  type        = bool
  default     = false
}

variable "control_plane_invoker_members" {
  description = "IAM members allowed to invoke the private control plane, for example the existing Orqaly API service account."
  type        = set(string)
  default     = []
}

variable "n8n_operator_invoker_members" {
  description = "Optional operator IAM members allowed to reach private n8n. Customers must never be included."
  type        = set(string)
  default     = []
}

variable "control_plane_database_url_secret_version" {
  description = "Existing Secret Manager version containing DATABASE_URL. Terraform creates no secret values."
  type        = string
  default     = "latest"
}

variable "principal_signing_key_secret_version" {
  description = "Existing Secret Manager version containing ORQALY_PRINCIPAL_SIGNING_KEY."
  type        = string
  default     = "latest"
}

variable "n8n_database_password_secret_version" {
  description = "Existing Secret Manager version containing the n8n PostgreSQL password."
  type        = string
  default     = "latest"
}

variable "n8n_encryption_key_secret_version" {
  description = "Existing Secret Manager version containing N8N_ENCRYPTION_KEY."
  type        = string
  default     = "latest"
}

variable "task_queue_max_dispatches_per_second" {
  description = "Preview dispatch-rate ceiling."
  type        = number
  default     = 1

  validation {
    condition     = var.task_queue_max_dispatches_per_second > 0 && var.task_queue_max_dispatches_per_second <= 10
    error_message = "task_queue_max_dispatches_per_second must be greater than 0 and no more than 10."
  }
}

variable "task_queue_max_concurrent_dispatches" {
  description = "Preview concurrent-dispatch ceiling."
  type        = number
  default     = 1

  validation {
    condition     = var.task_queue_max_concurrent_dispatches >= 1 && var.task_queue_max_concurrent_dispatches <= 10
    error_message = "task_queue_max_concurrent_dispatches must be between 1 and 10."
  }
}

variable "billing_account_id" {
  description = "Optional billing account ID. When set, Terraform creates a project-scoped alert budget; alerts never cap spend."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.billing_account_id == null ||
      can(regex("^(billingAccounts/)?[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    )
    error_message = "billing_account_id must be a bare 000000-000000-000000 ID or billingAccounts/ prefixed ID."
  }
}

variable "monthly_budget_amount" {
  description = "Monthly budget alert amount in whole currency units."
  type        = number
  default     = 50

  validation {
    condition     = var.monthly_budget_amount >= 1 && floor(var.monthly_budget_amount) == var.monthly_budget_amount
    error_message = "monthly_budget_amount must be a positive whole number."
  }
}

variable "budget_currency" {
  description = "ISO 4217 currency for the optional billing budget."
  type        = string
  default     = "EUR"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency))
    error_message = "budget_currency must be a three-letter uppercase ISO 4217 code."
  }
}
