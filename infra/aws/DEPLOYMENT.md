# AWS deployment runbook

This repository produces a static frontend bundle and a production Express container. Deploy the database and image bucket before sending traffic; Stripe remains in test mode unless the application is deliberately changed.

## Recommended layout

- **Frontend:** S3 private origin behind CloudFront (Origin Access Control), with SPA fallback to `index.html`.
- **API:** Express container on EC2 in private subnets, reached through an HTTPS Application Load Balancer. The app listens on port 4000.
- **Database:** RDS for PostgreSQL in private subnets, with inbound 5432 allowed only from the API security group.
- **Images:** private S3 bucket; CloudFront serves objects from the `products/` prefix. Set `ASSET_BASE_URL` to the image distribution origin.
- **Secrets:** AWS Secrets Manager or SSM Parameter Store. Attach an EC2 instance role for image writes; do not put AWS access keys in container environment variables.

## Build and publish

Build the API image from the repository root with `docker build -f backend/Dockerfile -t mini-store-api .`. Build the frontend with `docker build -f frontend/Dockerfile --build-arg VITE_API_URL=https://store.example.com/api -t mini-store-web .`. Push the API image to a private ECR repository. Publish `frontend/dist` to the frontend S3 origin when hosting it as static content, or run the frontend container behind the web distribution.

The Vite API URL is embedded at build time. Point it at the same site origin (for example, route `/api/*` through CloudFront to the load balancer) when possible. `FRONTEND_URL` must exactly match the browser origin. The API checks that origin on state-changing requests and only allows the configured origin through CORS.

## Database and migrations

1. Create an encrypted RDS PostgreSQL instance with deletion protection and automated backups enabled. Keep it private; use Multi-AZ for production availability.
2. Allow inbound database traffic only from the API security group.
3. Store `DATABASE_URL` and a generated `JWT_SECRET` (at least 32 characters) in managed secrets.
4. Before deploying a new API version, run the one-off migration command from a task or EC2 instance that has the same database network access and credentials: `node backend/dist/scripts/migrate.js`.
5. Confirm `/api/health` reports a database connection before routing traffic to a new API task.

Do not run multiple migration jobs concurrently. Back up before destructive schema changes and add a new numbered migration instead of editing one already applied.

## API environment

Set these values in the API task definition or managed runtime configuration:

```text
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://store.example.com
DATABASE_URL=postgresql://...
JWT_SECRET=<managed random secret>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
AWS_REGION=<bucket region>
AWS_S3_BUCKET=<private product image bucket>
ASSET_BASE_URL=https://images.example.com
```

Keep Stripe keys in test mode until the business has completed its live-payment readiness work. Configure the Stripe webhook endpoint as `https://store.example.com/api/payments/webhook`; forward `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed` events.

## S3 and CloudFront

- Block all public access on the bucket and enable default encryption and versioning.
- Grant the API instance role `s3:PutObject` and `s3:DeleteObject` only for `arn:aws:s3:::<bucket>/products/*`.
- Grant the CloudFront Origin Access Control `s3:GetObject` only for the `products/*` prefix and scope the bucket policy to the distribution ARN.
- Configure an image distribution origin path for the same bucket and set `ASSET_BASE_URL` to that distribution's HTTPS hostname.
- Limit upload size and content types in the API (currently 5 MB; JPEG, PNG, WEBP).

## HTTPS, cookies, and edge routing

- Terminate TLS at an Application Load Balancer or CloudFront using an ACM certificate. For a CloudFront custom hostname, ACM certificates must be in `us-east-1`.
- Force HTTP to HTTPS. The API sets `Secure` on the HTTP-only session cookie in production.
- Forward cookies and query strings to API routes, disable caching for authenticated API responses, and allow the required REST methods.
- Restrict API ingress to the load balancer security group. Restrict RDS ingress to the API security group.
- If the web and API use separate hostnames, keep them on the same site (same registrable domain), use HTTPS on both, and set `FRONTEND_URL` to the exact frontend origin.

## Release checklist

- Configure RDS backups, maintenance window, alarms, and a tested restore procedure.
- Configure CloudWatch logs and alarms for API 5xx responses, task health, database connections, and storage upload errors.
- Deploy API with a rolling or blue/green strategy; keep the previous image available for rollback.
- Apply migrations once, then deploy the matching API image.
- Publish the frontend bundle and invalidate changed CloudFront paths.
- Confirm registration, login/logout, product browsing, cart writes, test checkout, Stripe webhook confirmation, order history, admin authorization, and image delivery in the deployed environment.
- Promote an administrator out of band in the database; never add public admin registration.
