variable "project" {
  description = "Name prefix for every resource"
  type        = string
  default     = "movie-night"
}

variable "region" {
  description = "AWS region for everything except CloudFront (global)"
  type        = string
  default     = "us-east-1"
}

variable "tmdb_token" {
  description = "TMDB API Read Access Token (v4). Passed as TF_VAR_tmdb_token from .env, stored in SSM as SecureString"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client id. Empty = Google sign-in disabled"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_email" {
  description = "Where the monthly budget alert goes. Empty = no budget alert"
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Budget alert threshold in USD"
  type        = number
  default     = 10
}

variable "donate_url" {
  description = "Link for the 'donate' card (e.g. a Monobank jar). Empty = card hidden"
  type        = string
  default     = ""
}
