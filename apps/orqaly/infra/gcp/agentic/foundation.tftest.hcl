mock_provider "google" {}

run "safe_default_plan" {
  command = plan

  variables {
    project_id = "orqaly-agent-test-123"
  }

  assert {
    condition = (
      length(google_cloud_run_v2_service.control_plane) == 0 &&
      length(google_cloud_run_v2_service.n8n) == 0
    )
    error_message = "Default planning must not deploy runtime services."
  }

  assert {
    condition     = var.agentic_execution_enabled == false
    error_message = "Live Agent execution must default to disabled."
  }

  assert {
    condition = (
      google_sql_database_instance.agentic[0].deletion_protection &&
      google_sql_database_instance.agentic[0].settings[0].deletion_protection_enabled
    )
    error_message = "A newly created Cloud SQL instance must have Terraform and API deletion protection."
  }

  assert {
    condition = (
      google_storage_bucket.artifacts.public_access_prevention == "enforced" &&
      google_storage_bucket.artifacts.uniform_bucket_level_access &&
      google_storage_bucket.artifacts.force_destroy == false
    )
    error_message = "The artifact bucket must be private and protected from force deletion."
  }

  assert {
    condition = alltrue([
      for secret in values(google_secret_manager_secret.runtime) : secret.deletion_protection
    ])
    error_message = "Runtime secret containers must have deletion protection by default."
  }

  assert {
    condition = (
      google_cloud_tasks_queue.agentic_steps.rate_limits[0].max_dispatches_per_second == 1 &&
      google_cloud_tasks_queue.agentic_steps.rate_limits[0].max_concurrent_dispatches == 1
    )
    error_message = "The Preview queue must default to one dispatch per second and one concurrent dispatch."
  }
}

run "private_bounded_runtime_shape" {
  command = plan

  variables {
    project_id              = "orqaly-agent-test-123"
    deploy_runtime_services = true
    control_plane_image     = "europe-west1-docker.pkg.dev/orqaly-agent-test-123/runtime/control@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    n8n_image               = "europe-west1-docker.pkg.dev/orqaly-agent-test-123/runtime/n8n@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = (
      google_cloud_run_v2_service.control_plane[0].ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY" &&
      google_cloud_run_v2_service.n8n[0].ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY"
    )
    error_message = "Both runtime services must use private-only ingress."
  }

  assert {
    condition = (
      google_cloud_run_v2_service.n8n[0].template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.n8n[0].template[0].scaling[0].max_instance_count == 1 &&
      google_cloud_run_v2_service.n8n[0].template[0].max_instance_request_concurrency == 1 &&
      google_cloud_run_v2_service.n8n[0].template[0].containers[0].resources[0].cpu_idle == false
    )
    error_message = "n8n must remain scale-to-zero, single-instance, single-concurrency and instance-CPU while active."
  }

  assert {
    condition = one([
      for item in google_cloud_run_v2_service.control_plane[0].template[0].containers[0].env : item.value
      if item.name == "AGENTIC_EXECUTION_ENABLED"
    ]) == "false"
    error_message = "Deploying containers must not implicitly enable Agent execution."
  }

  assert {
    condition = (
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "EXECUTIONS_TIMEOUT"
      ]) == "30" &&
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "EXECUTIONS_TIMEOUT_MAX"
      ]) == "30" &&
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "N8N_PUBLIC_API_DISABLED"
      ]) == "true" &&
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "N8N_SSRF_PROTECTION_ENABLED"
      ]) == "true" &&
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "N8N_SSRF_BLOCKED_IP_RANGES"
      ]) == "default" &&
      one([
        for item in google_cloud_run_v2_service.n8n[0].template[0].containers[0].env : item.value
        if item.name == "N8N_SSRF_ALLOWED_HOSTNAMES"
      ]) == "metadata.google.internal,orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app"
    )
    error_message = "n8n must retain the exact 30-second, public-API-disabled and SSRF-hardened execution contract."
  }

  assert {
    condition = (
      google_compute_firewall.n8n_deny_other_egress.direction == "EGRESS" &&
      google_compute_firewall.n8n_deny_other_egress.destination_ranges == toset(["0.0.0.0/0"]) &&
      one(google_compute_firewall.n8n_deny_other_egress.deny).protocol == "all"
    )
    error_message = "n8n must retain a final deny-all IPv4 egress rule."
  }

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.n8n_operator_invoker) == 0
    error_message = "The quarantined foundation must grant no automatic n8n invoker; the reviewed execution release owns API and Gateway IAM edges."
  }
}
