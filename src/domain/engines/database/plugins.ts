import type { DatabaseUrlParameter } from './database';

export interface DatabasePlugin {
  readonly id: string;
  readonly label: string;
  readonly urlParameter: DatabaseUrlParameter;
  /** Label for the address field, e.g. "Connection URL" or "Host". */
  readonly urlLabel: string;
  readonly urlTemplate: string;
  /** Statements are SQL for most plugins and JSON for document stores. */
  readonly statementFormat: 'sql' | 'json';
  readonly creationStatements: string;
  readonly revocationStatements: string;
  /** Statements a static role runs to set a new password; empty uses the plugin default. */
  readonly rotationStatements: string;
  readonly rootRotationStatements: string;
  /** Example for the plugin options field when the plugin needs more than a URL. */
  readonly extraSettingsExample?: string;
}

const POSTGRES_CREATE = [
  `CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';`,
  'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{{name}}";',
].join('\n');
const POSTGRES_REVOKE = [
  'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{{name}}";',
  'DROP ROLE IF EXISTS "{{name}}";',
].join('\n');

const MYSQL_CREATE = [
  `CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';`,
  `GRANT SELECT ON app.* TO '{{name}}'@'%';`,
].join('\n');
const MYSQL_REVOKE = `DROP USER IF EXISTS '{{name}}'@'%';`;
const MYSQL_ROTATE = `ALTER USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';`;
const MYSQL_ROOT = `ALTER USER '{{username}}'@'%' IDENTIFIED BY '{{password}}';`;

function mysqlVariant(id: string, label: string, host: string): DatabasePlugin {
  return {
    id,
    label,
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: `{{username}}:{{password}}@tcp(${host}:3306)/`,
    statementFormat: 'sql',
    creationStatements: MYSQL_CREATE,
    revocationStatements: MYSQL_REVOKE,
    rotationStatements: MYSQL_ROTATE,
    rootRotationStatements: MYSQL_ROOT,
  };
}

/** Database plugins that ship with Vault, with starting templates for each. */
export const DATABASE_PLUGINS: readonly DatabasePlugin[] = [
  {
    id: 'postgresql-database-plugin',
    label: 'PostgreSQL',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: 'postgresql://{{username}}:{{password}}@db.internal:5432/app',
    statementFormat: 'sql',
    creationStatements: POSTGRES_CREATE,
    revocationStatements: POSTGRES_REVOKE,
    rotationStatements: `ALTER USER "{{name}}" WITH PASSWORD '{{password}}';`,
    rootRotationStatements: `ALTER USER "{{username}}" WITH PASSWORD '{{password}}';`,
  },
  mysqlVariant('mysql-database-plugin', 'MySQL / MariaDB', 'db.internal'),
  mysqlVariant('mysql-rds-database-plugin', 'MySQL on Amazon RDS', 'app.abc123.us-east-1.rds.amazonaws.com'),
  mysqlVariant('mysql-aurora-database-plugin', 'Amazon Aurora MySQL', 'app.cluster-abc123.us-east-1.rds.amazonaws.com'),
  {
    ...mysqlVariant('mysql-legacy-database-plugin', 'MySQL 5.6 and earlier', 'db.internal'),
    revocationStatements: `DROP USER '{{name}}'@'%';`,
    rotationStatements: `SET PASSWORD FOR '{{name}}'@'%' = PASSWORD('{{password}}');`,
    rootRotationStatements: `SET PASSWORD FOR '{{username}}'@'%' = PASSWORD('{{password}}');`,
  },
  {
    id: 'mssql-database-plugin',
    label: 'Microsoft SQL Server',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: 'sqlserver://{{username}}:{{password}}@db.internal:1433',
    statementFormat: 'sql',
    creationStatements: [
      `CREATE LOGIN [{{name}}] WITH PASSWORD = '{{password}}';`,
      'CREATE USER [{{name}}] FOR LOGIN [{{name}}];',
      'GRANT SELECT ON SCHEMA::dbo TO [{{name}}];',
    ].join('\n'),
    revocationStatements: ['DROP USER IF EXISTS [{{name}}];', 'DROP LOGIN [{{name}}];'].join('\n'),
    rotationStatements: `ALTER LOGIN [{{name}}] WITH PASSWORD = '{{password}}';`,
    rootRotationStatements: `ALTER LOGIN [{{username}}] WITH PASSWORD = '{{password}}';`,
  },
  {
    id: 'mongodb-database-plugin',
    label: 'MongoDB',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: 'mongodb://{{username}}:{{password}}@db.internal:27017/admin?tls=true',
    statementFormat: 'json',
    creationStatements: '{ "db": "admin", "roles": [{ "role": "readWrite", "db": "app" }] }',
    revocationStatements: '',
    rotationStatements: '',
    rootRotationStatements: '',
  },
  {
    id: 'oracle-database-plugin',
    label: 'Oracle',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: '{{username}}/{{password}}@db.internal:1521/ORCLPDB1',
    statementFormat: 'sql',
    creationStatements: [
      'CREATE USER {{username}} IDENTIFIED BY "{{password}}";',
      'GRANT CONNECT TO {{username}};',
      'GRANT CREATE SESSION TO {{username}};',
    ].join('\n'),
    revocationStatements: [
      'REVOKE CONNECT FROM {{username}};',
      'REVOKE CREATE SESSION FROM {{username}};',
      'DROP USER {{username}};',
    ].join('\n'),
    rotationStatements: 'ALTER USER {{username}} IDENTIFIED BY "{{password}}";',
    rootRotationStatements: '',
  },
  {
    id: 'redis-database-plugin',
    label: 'Redis',
    urlParameter: 'host',
    urlLabel: 'Host',
    urlTemplate: 'redis.internal',
    statementFormat: 'json',
    creationStatements: '["~*", "+@read"]',
    revocationStatements: '',
    rotationStatements: '',
    rootRotationStatements: '',
    extraSettingsExample: '{ "port": 6379, "tls": true }',
  },
  {
    id: 'redshift-database-plugin',
    label: 'Amazon Redshift',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: 'postgresql://{{username}}:{{password}}@cluster.abc123.us-east-1.redshift.amazonaws.com:5439/dev',
    statementFormat: 'sql',
    creationStatements: [
      `CREATE USER "{{name}}" WITH PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';`,
      'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{{name}}";',
    ].join('\n'),
    revocationStatements: [
      'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{{name}}";',
      'DROP USER IF EXISTS "{{name}}";',
    ].join('\n'),
    rotationStatements: `ALTER USER "{{name}}" WITH PASSWORD '{{password}}';`,
    rootRotationStatements: `ALTER USER "{{username}}" WITH PASSWORD '{{password}}';`,
  },
  {
    id: 'snowflake-database-plugin',
    label: 'Snowflake',
    urlParameter: 'connection_url',
    urlLabel: 'Connection URL',
    urlTemplate: '{{username}}:{{password}}@account-id/app_db',
    statementFormat: 'sql',
    creationStatements: [
      `CREATE USER {{name}} PASSWORD = '{{password}}' DAYS_TO_EXPIRY = {{expiration}} DEFAULT_ROLE = analyst;`,
      'GRANT ROLE analyst TO USER {{name}};',
    ].join('\n'),
    revocationStatements: 'DROP USER {{name}};',
    rotationStatements: `ALTER USER {{name}} SET PASSWORD = '{{password}}';`,
    rootRotationStatements: '',
  },
  {
    id: 'elasticsearch-database-plugin',
    label: 'Elasticsearch',
    urlParameter: 'url',
    urlLabel: 'URL',
    urlTemplate: 'https://elastic.internal:9200',
    statementFormat: 'json',
    creationStatements: '{ "elasticsearch_role_definition": { "indices": [{ "names": ["app-*"], "privileges": ["read"] }] } }',
    revocationStatements: '',
    rotationStatements: '',
    rootRotationStatements: '',
    extraSettingsExample: '{ "ca_cert": "/etc/vault/elastic-ca.pem" }',
  },
];

export const DEFAULT_DATABASE_PLUGIN = DATABASE_PLUGINS[0];

/** Catalog entry for a plugin name; custom plugins return undefined. */
export function databasePlugin(id: string): DatabasePlugin | undefined {
  return DATABASE_PLUGINS.find((plugin) => plugin.id === id);
}

export function databasePluginLabel(id: string): string {
  return databasePlugin(id)?.label ?? id;
}

/** Where a plugin reads its address from; custom plugins use `connection_url`. */
export function databaseUrlParameter(id: string): DatabaseUrlParameter {
  return databasePlugin(id)?.urlParameter ?? 'connection_url';
}
