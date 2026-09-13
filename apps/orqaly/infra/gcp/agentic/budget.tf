resource "google_billing_budget" "agentic" {
  count = var.billing_account_id == null ? 0 : 1

  billing_account = startswith(var.billing_account_id, "billingAccounts/") ? var.billing_account_id : "billingAccounts/${var.billing_account_id}"
  display_name    = "${local.name} monthly alert"

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.monthly_budget_amount)
    }
  }

  budget_filter {
    projects               = ["projects/${data.google_project.current.number}"]
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [google_project_service.required]
}
