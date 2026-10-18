# Multi-Tenant CSV Export API with Functional Isolation Tests

A secure, multi-tenant API for exporting weekly sales reports as CSV files with Role-Based Access Control (RBAC) and automated functional tenant isolation tests.

---

## 🌟 Key Features

1. **Shared-Database, Shared-Schema Logical Multi-Tenancy**:
   - All tenant data resides in shared tables (`users`, `sales_records`).
   - Every single query strictly filters by `tenant_id` extracted from a cryptographically signed JWT.
   - Any client-supplied tenant ID in query params (e.g. `?tenant_id=...`) or body is completely ignored to prevent Insecure Direct Object Reference (IDOR) attacks.

2. **Role-Based Access Control (RBAC)**:
   - **`admin`**: Exports all sales records belonging to their tenant across all agents.
   - **`agent`**: Strictly restricted to their own sales records (`tenant_id = req.user.tenantId AND agent_id = req.user.userId`).

3. **CSV Export with Proper Headers**:
   - Serves reports as RFC-compliant CSV formatted files.
   - Columns: `id,amount,sale_date,client_name`.
   - Headers: `Content-Type: text/csv` and `Content-Disposition: attachment; filename="sales_report.csv"`.

4. **Robust Security & Error Handling**:
   - Passwords securely hashed with `bcrypt`.
   - Timing and enumeration attack prevention on `/api/auth/login` (identical 401 response for non-existent users and wrong passwords).
   - Sanitized 500 error responses with no internal stack traces or database leaks.

5. **Functional Isolation Test Suite**:
   - Comprehensive test suite proving Tenant A users cannot access Tenant B data under any circumstances.
   - Includes verification against query param tampering, cross-tenant leaks, and RBAC agent boundary violations.

---

## 🏗️ Architecture

```
Client Request (GET /api/reports/sales + Bearer JWT)
         │
         ▼
 Express Auth Middleware
  ├─ Validates JWT Signature & Expiration
  └─ Injects context: { userId, tenantId, role }
         │
         ▼
 Export Controller
  ├─ If role === 'admin': SELECT ... WHERE tenant_id = ?
  └─ If role === 'agent': SELECT ... WHERE tenant_id = ? AND agent_id = ?
         │
         ▼
 CSV Formatter (id,amount,sale_date,client_name)
         │
         ▼
 Streams/Buffers response with Content-Disposition attachment
```

---

## 📁 Project Structure

```
├── docker-compose.yml          # Container configuration for API and PostgreSQL DB
├── Dockerfile                  # Application container image definition
├── .env.example                # Example environment variables
├── .env                        # Local environment variables
├── init.sql                    # PostgreSQL schema definition and seed data
├── submission.json             # Test accounts configuration for automated evaluator
├── run-tests.sh                # Executable shell script to run isolation tests
├── package.json                # Project dependencies and test scripts
├── src/
│   ├── index.js                # Server entrypoint with auto-seeding & graceful shutdown
│   ├── app.js                  # Express app and route wiring
│   ├── config/
│   │   └── db.js               # PostgreSQL pool with in-memory fallback for testing
│   ├── middleware/
│   │   ├── auth.js             # JWT verification and context injection
│   │   └── errorHandler.js     # Sanitized error handler preventing stack leaks
│   ├── controllers/
│   │   ├── authController.js   # POST /api/auth/login implementation
│   │   └── reportController.js # GET /api/reports/sales CSV generation
│   └── models/
│       ├── userModel.js        # User credential lookups
│       └── salesModel.js       # Tenant-isolated sales queries
└── tests/
    ├── setup.js                # Test suite hooks
    └── isolation.test.js       # Functional isolation and RBAC test suite
```

---

## 🗄️ Database Schema

### `tenants`
| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL / INTEGER | PRIMARY KEY |
| `name` | VARCHAR(255) | NOT NULL |

### `users`
| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL / INTEGER | PRIMARY KEY |
| `tenant_id` | INTEGER | NOT NULL, REFERENCES `tenants(id)` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `password_hash`| VARCHAR(255) | NOT NULL (bcrypt) |
| `role` | VARCHAR(50) | NOT NULL ('admin' or 'agent') |
| *Constraint* | `fk_tenant` | FOREIGN KEY (`tenant_id`) REFERENCES `tenants(id)` |

### `sales_records`
| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL / INTEGER | PRIMARY KEY |
| `tenant_id` | INTEGER | NOT NULL, REFERENCES `tenants(id)` |
| `agent_id` | INTEGER | NOT NULL, REFERENCES `users(id)` |
| `amount` | NUMERIC(10, 2) | NOT NULL |
| `sale_date` | DATE | NOT NULL |
| `client_name` | VARCHAR(255) | NOT NULL |
| *Constraint* | `fk_sales_tenant` | FOREIGN KEY (`tenant_id`) REFERENCES `tenants(id)` |
| *Constraint* | `fk_sales_agent` | FOREIGN KEY (`agent_id`) REFERENCES `users(id)` |

---

## 🚀 Running the Application with Docker Compose

To start both the PostgreSQL database and the API service in one command:

```bash
docker-compose up -d
```

- PostgreSQL container automatically runs `init.sql` on startup to initialize and seed the tables.
- Healthchecks ensure the API waits for PostgreSQL to become healthy before accepting traffic.
- The API is served on port `3000`.

Check health:
```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## 🧪 Running the Functional Test Suite

You can execute the test suite via the provided script:

```bash
./run-tests.sh
```

Or via npm:

```bash
npm run test:isolation
```

Or:

```bash
npm test
```

The test suite validates:
- [x] Schema & relational integrity (`tenants`, `users`, `sales_records` foreign keys).
- [x] Authentication & JWT generation with `userId`, `tenantId`, and `role`.
- [x] Enumeration-resistant authentication error handling.
- [x] Admin CSV export of all tenant records with `Content-Type: text/csv` and `Content-Disposition`.
- [x] Agent CSV export restricted only to the agent's own records within the tenant.
- [x] **Tenant Isolation**: Admin A cannot export Tenant B records under any circumstances.
- [x] **Tenant Isolation**: Agent A cannot export Tenant B records.
- [x] **IDOR Resistance**: Requests with injected `?tenant_id=...` query parameters are strictly ignored.
- [x] Unauthenticated and malformed token requests return 401 Unauthorized.
- [x] Sanitized error messages without leaked stack traces.

---

## 🔑 Test Accounts (`submission.json`)

| Account Key | Email | Password | Tenant | Role |
|---|---|---|---|---|
| `tenantA_Admin` | `adminA@example.com` | `secret123` | Tenant A (1) | Admin |
| `tenantA_Agent` | `agentA@example.com` | `secret123` | Tenant A (1) | Agent |
| `tenantB_Admin` | `adminB@example.com` | `secret123` | Tenant B (2) | Admin |

---

## 📡 API Endpoints

### 1. Healthcheck
- **`GET /health`**
- Response: `200 OK`
  ```json
  { "status": "ok" }
  ```

### 2. Login
- **`POST /api/auth/login`**
- Request Body:
  ```json
  {
    "email": "adminA@example.com",
    "password": "secret123"
  }
  ```
- Response: `200 OK`
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### 3. Export Sales Report
- **`GET /api/reports/sales`**
- Headers: `Authorization: Bearer <JWT>`
- Response: `200 OK`
- Header: `Content-Type: text/csv`
- Header: `Content-Disposition: attachment; filename="sales_report.csv"`
- Body:
  ```csv
  id,amount,sale_date,client_name
  1,1500.00,2023-10-01,Acme Corp
  2,450.50,2023-10-02,Globex Inc
  3,780.00,2023-10-03,Stark Industries
  ```
