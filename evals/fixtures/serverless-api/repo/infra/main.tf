variable "region" {
  type    = string
  default = "us-east-1"
}

provider "aws" {
  region = var.region
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_apigatewayv2_api" "orders_api" {
  name          = "orders-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "create_order" {
  api_id                 = aws_apigatewayv2_api.orders_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_order.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_orders" {
  api_id    = aws_apigatewayv2_api.orders_api.id
  route_key = "POST /orders"
  target    = "integrations/${aws_apigatewayv2_integration.create_order.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.orders_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_order.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.orders_api.execution_arn}/*/*"
}

resource "aws_lambda_function" "create_order" {
  function_name = "create-order"
  role          = aws_iam_role.create_order.arn
  runtime       = "nodejs22.x"
  handler       = "create_order.handler"
  filename      = "${path.module}/../dist/create_order.zip"

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.orders.name
      QUEUE_URL  = aws_sqs_queue.order_events.url
    }
  }
}

resource "aws_dynamodb_table" "orders" {
  name         = "orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"

  attribute {
    name = "orderId"
    type = "S"
  }
}

resource "aws_sqs_queue" "order_events" {
  name                       = "order-events"
  visibility_timeout_seconds = 60
}

resource "aws_lambda_function" "send_receipt" {
  function_name = "send-receipt"
  role          = aws_iam_role.send_receipt.arn
  runtime       = "nodejs22.x"
  handler       = "send_receipt.handler"
  filename      = "${path.module}/../dist/send_receipt.zip"

  environment {
    variables = {
      BUCKET = aws_s3_bucket.receipts.bucket
    }
  }

  depends_on = [aws_dynamodb_table.orders]
}

resource "aws_lambda_event_source_mapping" "order_events" {
  event_source_arn = aws_sqs_queue.order_events.arn
  function_name    = aws_lambda_function.send_receipt.arn
  batch_size       = 10
}

resource "aws_s3_bucket" "receipts" {
  bucket = "orders-receipts-${random_id.suffix.hex}"
}

resource "aws_cloudwatch_log_group" "create_order" {
  name              = "/aws/lambda/create-order"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "send_receipt" {
  name              = "/aws/lambda/send-receipt"
  retention_in_days = 14
}
