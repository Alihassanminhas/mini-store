# Mini E-commerce Store

A TypeScript React and Express storefront backed by PostgreSQL. The implementation follows the project plan in `.claude/plans/ecommerce.plan.md`.

## Current implementation

- Strict TypeScript npm workspaces for the React/Vite frontend and Express API.
- Responsive Tailwind storefront, catalog search/filters/pagination, product detail, account, order history, checkout, and admin views.
- Express security defaults, credentialed CORS, auth rate limiting, structured errors, environment validation, PostgreSQL pool, and database health endpoint.
- Cookie-backed authentication with scrypt password hashing, signed JWT sessions, role checks refreshed from PostgreSQL, and cross-origin write protection.
- PostgreSQL schema and sample catalog migrations, repeatable migration runner, persistent carts, stock-safe order reservations, Stripe test checkout/webhooks, and inventory audit records.
- Admin catalog and variant management, audited inventory adjustments, order fulfillment, and image uploads to S3.

## Local setup

1. Install Node.js and PostgreSQL.
2. Create a local database named `mini_store`.
3. Copy `backend/.env.example` to `backend/.env` and set a random `JWT_SECRET` of at least 32 characters. To enable checkout, add Stripe **test mode** keys (`sk_test_...`, `whsec_...`). To enable image uploads, configure an AWS region, S3 bucket, and runtime IAM credentials or an EC2 instance role.
4. Copy `frontend/.env.example` to `frontend/.env` if the API is not at `http://localhost:4000/api`.
5. Install dependencies with `npm install`.
6. Apply the schema with `npm run migrate --workspace backend`.
7. Start both apps with `npm run dev`.

The API health endpoint is `http://localhost:4000/api/health`. The frontend is served at `http://localhost:5173`.

To start the local PostgreSQL database and both production-style containers instead, run `docker compose up --build`. The storefront will be at `http://localhost:8080` and the API at `http://localhost:4000`.

For local Vite/Node development backed by the Compose database, run `docker compose up -d database` and set `DATABASE_URL=postgresql://mini_store:local_dev_password@localhost:5433/mini_store` in `backend/.env`. The Compose database is published on port `5433` to avoid conflicting with a local PostgreSQL service on `5432`.

## First administrator

Registration always creates a normal customer account. To promote a trusted local account, run this SQL directly against the local database after registering:

```sql
UPDATE users SET role = 'admin', updated_at = now()
WHERE email = lower('your-email@example.com');
```

Sign out and sign back in, then open `/admin`. Never expose an admin-promotion API to public users.

## Payments and product images

- Checkout accepts Stripe test secret keys only. Point Stripe CLI or a test webhook endpoint at `POST /api/payments/webhook`; webhook signature verification is required before order/payment/inventory state changes.
- Image uploads accept JPEG, PNG, and WEBP files up to 5 MB. The backend uses AWS SDK's default credential chain (use an EC2 instance role in AWS). Set `ASSET_BASE_URL` to a CloudFront distribution backed by a private S3 bucket where possible. Without it, the app constructs the regional S3 object URL, so configure public read access only for product objects if using that delivery option.

## Current deployment boundary

`backend/Dockerfile` and `frontend/Dockerfile` provide deployable containers; `.github/workflows/build.yml` compiles both workspaces on pushes and pull requests. AWS EC2/RDS/S3 provisioning, TLS/domain configuration, backups, and production cutover still need to be completed before release.

See [`infra/aws/DEPLOYMENT.md`](infra/aws/DEPLOYMENT.md) for the AWS deployment runbook.

## Environment and secrets

Do not commit `.env` files. Configure production secrets in managed runtime settings, enable HTTPS-only cookies, and restrict database, S3, and CORS access to the deployed services.
