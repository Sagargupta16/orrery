import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const db = new DynamoDBClient({});
const sqs = new SQSClient({});

// POST /orders: store the order, then queue an event so the receipt is written out of band.
export async function handler(event) {
  const body = JSON.parse(event.body ?? "{}");
  const orderId = randomUUID();
  await db.send(
    new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        orderId: { S: orderId },
        email: { S: body.email ?? "" },
        total: { N: String(body.total ?? 0) },
      },
    }),
  );
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify({ orderId, email: body.email, total: body.total }),
    }),
  );
  return { statusCode: 201, body: JSON.stringify({ orderId }) };
}
