// Shared test setup: in-memory DB, quiet logs. Import this FIRST in every unit test.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
