import Redis from "ioredis";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// Takes queued confirmation emails off the list and marks each order as emailed.
for (;;) {
  const [, job] = await redis.brpop("emails", 0);
  const { orderId, email } = JSON.parse(job);
  console.log(`confirmation for order ${orderId} to ${email}`);
  await pool.query("UPDATE orders SET emailed_at = now() WHERE id = $1", [orderId]);
}
