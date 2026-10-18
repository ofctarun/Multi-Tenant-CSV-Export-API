-- Multi-Tenant CSV Export API Schema & Seed Data

-- Drop tables if they exist (for clean re-runs)
DROP TABLE IF EXISTS sales_records CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- 1. Tenants Table
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- 2. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'agent')),
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Sales Records Table
CREATE TABLE sales_records (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    sale_date DATE NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    CONSTRAINT fk_sales_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed Data: Tenants
INSERT INTO tenants (name) VALUES
('Tenant A'),
('Tenant B');

-- Seed Data: Users
-- Passwords are all 'secret123' hashed with bcrypt (salt rounds = 10)
INSERT INTO users (tenant_id, email, password_hash, role) VALUES
(1, 'adminA@example.com', '$2a$10$1iKrFvk.1jIpiVg7cwgYE.v6SSmDbttCtMQ7WkrwXDI5or0vluEte', 'admin'),
(1, 'agentA@example.com', '$2a$10$1iKrFvk.1jIpiVg7cwgYE.v6SSmDbttCtMQ7WkrwXDI5or0vluEte', 'agent'),
(1, 'agentA2@example.com', '$2a$10$1iKrFvk.1jIpiVg7cwgYE.v6SSmDbttCtMQ7WkrwXDI5or0vluEte', 'agent'),
(2, 'adminB@example.com', '$2a$10$1iKrFvk.1jIpiVg7cwgYE.v6SSmDbttCtMQ7WkrwXDI5or0vluEte', 'admin'),
(2, 'agentB@example.com', '$2a$10$1iKrFvk.1jIpiVg7cwgYE.v6SSmDbttCtMQ7WkrwXDI5or0vluEte', 'agent');

-- Seed Data: Sales Records
INSERT INTO sales_records (tenant_id, agent_id, amount, sale_date, client_name) VALUES
(1, 2, 1500.00, '2023-10-01', 'Acme Corp'),
(1, 2, 450.50, '2023-10-02', 'Globex Inc'),
(1, 3, 780.00, '2023-10-03', 'Stark Industries'),
(2, 5, 2200.00, '2023-10-04', 'Tenant B Client'),
(2, 5, 3100.00, '2023-10-05', 'Wayne Enterprises');
