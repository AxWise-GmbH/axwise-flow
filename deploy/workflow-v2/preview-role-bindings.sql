\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA axwise TO axwise_v2_login;
GRANT SELECT, INSERT, UPDATE ON axwise.cognitive_operations TO axwise_v2_login;
ALTER ROLE axwise_v2_login SET statement_timeout = '15s';
