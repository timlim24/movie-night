# Optional custom domain. Set DOMAIN_NAME in .env (e.g. movienight.click) — the domain must have a
# Route 53 hosted zone (buying it in Route 53 creates one; for another registrar, create the zone and
# point the registrar's NS records at it). Empty = the app lives on the *.cloudfront.net address.

locals {
  custom_domain = var.domain_name != ""
  zone_name     = var.hosted_zone != "" ? var.hosted_zone : var.domain_name
}

data "aws_route53_zone" "main" {
  count = local.custom_domain ? 1 : 0
  name  = local.zone_name
}

# CloudFront only accepts certificates from us-east-1 (the region everything here already uses).
resource "aws_acm_certificate" "web" {
  count                     = local.custom_domain ? 1 : 0
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.custom_domain ? {
    for o in aws_acm_certificate.web[0].domain_validation_options : o.domain_name => o
  } : {}
  zone_id         = data.aws_route53_zone.main[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "web" {
  count                   = local.custom_domain ? 1 : 0
  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_route53_record" "web" {
  for_each = local.custom_domain ? toset(["A", "AAAA"]) : toset([])
  zone_id  = data.aws_route53_zone.main[0].zone_id
  name     = var.domain_name
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  for_each = local.custom_domain ? toset(["A", "AAAA"]) : toset([])
  zone_id  = data.aws_route53_zone.main[0].zone_id
  name     = "www.${var.domain_name}"
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
