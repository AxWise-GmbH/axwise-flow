\set ON_ERROR_STOP on

GRANT axwise_v2_api TO axwise_v2_api_login;
GRANT axwise_v2_worker TO axwise_v2_worker_login;
ALTER ROLE axwise_v2_api_login SET statement_timeout = '15s';
ALTER ROLE axwise_v2_worker_login SET statement_timeout = '15s';
