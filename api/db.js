const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: process.env.NODE_ENV !== "production",
});
const { Client, Pool } = require("pg");

function buildSslConfig() {
  const sslMode = String(process.env.PGSSLMODE || "").trim().toLowerCase();
  if (!sslMode || sslMode === "disable" || sslMode === "false") {
    return false;
  }
  return {
    rejectUnauthorized: sslMode === "verify-full" || sslMode === "verify-ca",
  };
}

const ssl = buildSslConfig();
const usingConnectionString = Boolean(process.env.DATABASE_URL);
const parsedDatabaseUrl = (() => {
  if (!usingConnectionString) {
    return null;
  }
  try {
    return new URL(process.env.DATABASE_URL);
  } catch (_error) {
    return null;
  }
})();
const connectionConfig = usingConnectionString
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl,
    }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl,
    };

console.info("[db] pool_config", {
  host: usingConnectionString ? parsedDatabaseUrl?.hostname || "DATABASE_URL" : connectionConfig.host,
  port: usingConnectionString ? parsedDatabaseUrl?.port || undefined : connectionConfig.port,
  database: usingConnectionString
    ? parsedDatabaseUrl?.pathname?.replace(/^\//, "") || undefined
    : connectionConfig.database,
  user: usingConnectionString ? parsedDatabaseUrl?.username || undefined : connectionConfig.user,
  via: usingConnectionString ? "DATABASE_URL" : "PG*",
  ssl_mode: process.env.PGSSLMODE || "disable",
});

const pool = new Pool(connectionConfig);

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

module.exports = pool;
module.exports.connectionConfig = connectionConfig;
module.exports.createDedicatedClient = () => new Client(connectionConfig);
