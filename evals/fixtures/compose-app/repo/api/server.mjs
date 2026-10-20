import { createServer } from "node:http";
import Redis from "ioredis";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// POST /orders stores the order and queues the confirmation email for the worker.
createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/orders") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const { email, total } = JSON.parse(body || "{}");
  const { rows } = await pool.query(
    "INSERT INTO orders (email, total) VALUES ($1, $2) RETURNING id",
    [email, total],
  );
  await redis.lpush("emails", JSON.stringify({ orderId: rows[0].id, email }));
  res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify(rows[0]));
}).listen(Number(process.env.PORT ?? 3000));
