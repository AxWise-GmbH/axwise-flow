resource "google_compute_network" "agentic" {
  count = var.create_network ? 1 : 0

  project                 = var.project_id
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "runtime" {
  count = var.create_network ? 1 : 0

  project                  = var.project_id
  name                     = "${local.name}-runtime"
  region                   = var.region
  network                  = google_compute_network.agentic[0].id
  ip_cidr_range            = var.runtime_subnet_cidr
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  count = var.create_network ? 1 : 0

  project       = var.project_id
  name          = "${local.name}-private-services"
  address_type  = "INTERNAL"
  purpose       = "VPC_PEERING"
  network       = google_compute_network.agentic[0].id
  address       = cidrhost(var.private_service_access_cidr, 0)
  prefix_length = tonumber(split("/", var.private_service_access_cidr)[1])
}

resource "google_service_networking_connection" "private_services" {
  count = var.create_network ? 1 : 0

  network                 = google_compute_network.agentic[0].id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services[0].name]

  depends_on = [google_project_service.required]
}

# n8n has no general outbound route. This allowlist is intentionally incomplete
# until a private Tool Gateway address is implemented and reviewed.
resource "google_compute_firewall" "n8n_sql_egress" {
  count = length(local.sql_destination_cidrs) > 0 ? 1 : 0

  project            = var.project_id
  name               = "${local.name}-n8n-sql-egress"
  network            = local.network_id
  direction          = "EGRESS"
  priority           = 900
  destination_ranges = local.sql_destination_cidrs
  target_tags        = ["${local.name}-n8n"]
  disabled           = false

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }
}

resource "google_compute_firewall" "n8n_google_api_egress" {
  project            = var.project_id
  name               = "${local.name}-n8n-google-egress"
  network            = local.network_id
  direction          = "EGRESS"
  priority           = 910
  destination_ranges = ["199.36.153.4/30", "199.36.153.8/30"]
  target_tags        = ["${local.name}-n8n"]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
}

resource "google_compute_firewall" "n8n_deny_other_egress" {
  project            = var.project_id
  name               = "${local.name}-n8n-deny-egress"
  network            = local.network_id
  direction          = "EGRESS"
  priority           = 65534
  destination_ranges = ["0.0.0.0/0"]
  target_tags        = ["${local.name}-n8n"]

  deny {
    protocol = "all"
  }
}
