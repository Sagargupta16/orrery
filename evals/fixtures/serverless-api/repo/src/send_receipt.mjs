import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

// Triggered by the order-events queue: writes one plain-text receipt per order.
export async function handler(event) {
  for (const record of event.Records) {
    const order = JSON.parse(record.body);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.BUCKET,
        Key: `receipts/${order.orderId}.txt`,
        Body: `Receipt for order ${order.orderId}\nTotal: ${order.total}\n`,
        ContentType: "text/plain",
      }),
    );
  }
}
