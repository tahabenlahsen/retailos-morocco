process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "file:./test.db"
process.env.NEXTAUTH_SECRET = "test-secret-not-for-production-0123456789"
process.env.NEXTAUTH_URL = "http://localhost:3000"
delete process.env.REDIS_URL // tests always exercise the in-memory limiter
