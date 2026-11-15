output "app_url" {
  value = local.app_url
}

output "web_bucket" {
  value = aws_s3_bucket.web.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "google_redirect_uri" {
  description = "Paste into Google Cloud Console → OAuth client → Authorized redirect URIs"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com/oauth2/idpresponse"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "e2e_client_id" {
  value = aws_cognito_user_pool_client.e2e.id
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}
