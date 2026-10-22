-- A small shop schema in Postgres flavor, with the SQLite and pg_dump forms the importer reads.

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

/* Every order belongs to one customer; the shipping address is optional. */
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  shipping_address_id uuid,
  status varchar(20) NOT NULL DEFAULT 'new; unpaid',
  total numeric(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "addresses" (
  "id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "line1" text NOT NULL,
  "city" text,
  CONSTRAINT addresses_pkey PRIMARY KEY ("id"),
  CONSTRAINT addresses_customer_fk FOREIGN KEY ("customer_id")
    REFERENCES "customers" ("id")
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price double precision NOT NULL,
  UNIQUE (sku)
);

-- A join table: one row per product on an order.
CREATE TABLE order_items (
  order_id uuid NOT NULL REFERENCES orders(id),
  product_id integer NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE,
  provider text NOT NULL,
  paid_at timestamptz
);

CREATE TABLE employees (
  id serial PRIMARY KEY,
  manager_id integer REFERENCES employees(id),
  warehouse_id integer REFERENCES warehouses(id)
);

CREATE INDEX orders_customer_idx ON orders (customer_id);

CREATE FUNCTION touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE ONLY public.orders
  ADD CONSTRAINT orders_shipping_fk FOREIGN KEY (shipping_address_id) REFERENCES public.addresses(id);

ALTER TABLE payments ADD FOREIGN KEY (order_id) REFERENCES orders (id);
