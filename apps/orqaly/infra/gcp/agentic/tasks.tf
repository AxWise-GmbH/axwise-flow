resource "google_cloud_tasks_queue" "agentic_steps" {
  project  = var.project_id
  name     = "${local.name}-steps"
  location = var.region

  rate_limits {
    max_dispatches_per_second = var.task_queue_max_dispatches_per_second
    max_concurrent_dispatches = var.task_queue_max_concurrent_dispatches
  }

  retry_config {
    max_attempts       = 5
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
  }

  stackdriver_logging_config {
    sampling_ratio = 1.0
  }

  depends_on = [google_project_service.required]
}

# The queue is capacity reserved only. No runtime identity can enqueue today.
# A future execution-kernel increment must define and enforce the exact private
# handler contract, then add narrowly scoped enqueue and OIDC invocation IAM.
