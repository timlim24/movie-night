# One DynamoDB table for the whole app (single-table design, see backend/README section in the root README).
# Why DynamoDB and not RDS: no VPC → no NAT gateway (~$32/month) for the Lambda to reach TMDB,
# pay-per-request pricing → ~$0 at prototype scale, nothing runs when nobody uses the app.
resource "aws_dynamodb_table" "main" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Rooms expire automatically two days after creation.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  deletion_protection_enabled = true
}

# TMDB token lives in SSM Parameter Store (SecureString, free tier), never in the Lambda package.
resource "aws_ssm_parameter" "tmdb_token" {
  name  = "/${local.name}/tmdb-token"
  type  = "SecureString"
  value = var.tmdb_token
}
