output "runtime_services_deployed" {
  description = "Whether this configuration currently includes the private Cloud Run services."
  value       = var.deploy_runtime_services
}

output "live_execution_enabled" {
  description = "Authoritative value passed to AGENTIC_EXECUTION_ENABLED."
  value       = var.agentic_execution_enabled
}

output "network_id" {
  description = "VPC used for Direct VPC egress and private Cloud SQL access."
  value       = local.network_id
}

output "subnetwork_id" {
  description = "Regional Direct VPC egress subnet."
  value       = local.subnet_id
}

output "cloud_sql_instance_name" {
  description = "Created or reused Cloud SQL instance name."
  value       = local.cloud_sql_instance_name
}

output "cloud_sql_connection_name" {
  description = "Created or reused Cloud SQL connection name. This is not a credential."
  value       = local.cloud_sql_connection_name
}

output "database_names" {
  description = "Separate canonical and n8n database names."
  value = {
    agentic = var.agentic_database_name
    n8n     = var.n8n_database_name
  }
}

output "artifact_bucket_name" {
  description = "Private versioned artifact bucket. Runtime access is intentionally not granted yet."
  value       = google_storage_bucket.artifacts.name
}

output "artifact_registry_repository" {
  description = "Repository into which reviewed control-plane and mirrored n8n images should be published."
  value       = google_artifact_registry_repository.runtime.name
}

output "task_queue" {
  description = "Reserved Cloud Tasks queue ID. No runtime identity receives enqueue authority until the generic execution kernel exists."
  value       = google_cloud_tasks_queue.agentic_steps.id
}

output "service_accounts" {
  description = "Least-privilege runtime identities."
  value = {
    control_plane = google_service_account.control_plane.email
    n8n           = google_service_account.n8n.email
    task_invoker  = google_service_account.task_invoker.email
  }
}

output "secret_containers" {
  description = "Secret Manager container IDs. No versions or values are managed by Terraform."
  value       = { for key, secret in google_secret_manager_secret.runtime : key => secret.id }
}

output "control_plane_uri" {
  description = "Private Cloud Run URI, or null while runtime deployment is disabled."
  value       = try(google_cloud_run_v2_service.control_plane[0].uri, null)
}

output "n8n_uri" {
  description = "Private operator-only n8n URI, or null while runtime deployment is disabled."
  value       = try(google_cloud_run_v2_service.n8n[0].uri, null)
}

output "future_components_not_provisioned" {
  description = "Security-critical components deliberately deferred to separately reviewed modules."
  value = [
    "tool-gateway-and-provider-event-ingress",
    "sealed-context-agent-and-artifact-harness",
    "sandbox-and-independent-reviewer-jobs",
    "generic-execution-kernel-task-target",
    "artifact-gateway",
  ]
}

output "cost_warning" {
  description = "Reminder surfaced in plan output."
  value       = "Cloud SQL is always-on and is the main fixed cost; budget alerts notify but never stop spend. Review plan and pricing before apply."
}
