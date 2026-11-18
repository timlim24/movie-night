# Authentication is bought, not built: Cognito user pool + managed login pages.
locals {
  google_enabled = var.google_client_id != ""
  cloudfront_url = "https://${aws_cloudfront_distribution.web.domain_name}"
  app_url        = var.domain_name != "" ? "https://${var.domain_name}" : local.cloudfront_url
  extra_urls     = [for u in split(",", var.extra_app_urls) : trimsuffix(trimspace(u), "/") if trimspace(u) != ""]
  app_urls       = distinct(concat([local.app_url, local.cloudfront_url], local.extra_urls))
}

resource "aws_cognito_user_pool" "main" {
  name                     = local.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  user_pool_tier           = "ESSENTIALS"
  deletion_protection      = "ACTIVE"

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Movie Night: код підтвердження"
    email_message        = "Твій код для Movie Night: {####}"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain                = "${local.name}-${local.suffix}"
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2
}

resource "aws_cognito_identity_provider" "google" {
  count         = local.google_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    picture        = "picture"
    username       = "sub"
  }

  # Cognito fills in Google's endpoints itself; without this every plan shows a no-op "change".
  lifecycle {
    ignore_changes = [
      provider_details["attributes_url"],
      provider_details["attributes_url_add_attributes"],
      provider_details["authorize_url"],
      provider_details["oidc_issuer"],
      provider_details["token_request_method"],
      provider_details["token_url"],
    ]
  }
}

# Public SPA client: authorization code flow + PKCE, no client secret.
resource "aws_cognito_user_pool_client" "web" {
  name         = "web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], local.google_enabled ? ["Google"] : [])

  # The cloudfront.net address keeps working after a custom domain is added.
  callback_urls = distinct(concat([for u in local.app_urls : "${u}/auth/callback"], ["http://localhost:5173/auth/callback"]))
  logout_urls   = distinct(concat([for u in local.app_urls : "${u}/"], ["http://localhost:5173/"]))

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  depends_on = [aws_cognito_identity_provider.google]
}

# Separate client used only by automated end-to-end checks (username + password, no browser).
resource "aws_cognito_user_pool_client" "e2e" {
  name                = "e2e-tests"
  user_pool_id        = aws_cognito_user_pool.main.id
  generate_secret     = false
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
}

resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id                = aws_cognito_user_pool.main.id
  client_id                   = aws_cognito_user_pool_client.web.id
  use_cognito_provided_values = true
}
