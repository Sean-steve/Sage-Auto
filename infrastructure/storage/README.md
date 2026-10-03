# S3-Compatible Storage Configuration (MinIO / AWS S3)

Local dev environment uses MinIO on port 9000 (API) and port 9001 (Console).
Production environment uses AWS S3 / Cloudflare R2 via standard S3Client abstraction.
Buckets:
- `carhire-documents` (private customer licenses, ownership agreements)
- `carhire-media` (public vehicle photos, inspection diagrams)
