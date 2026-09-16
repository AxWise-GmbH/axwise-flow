-- Allow organization-scoped communication logs for Communicator Organizations tab.

ALTER TABLE public.communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_context_type_check;

ALTER TABLE public.communication_logs
  ADD CONSTRAINT communication_logs_context_type_check
  CHECK (context_type IN (
    'build', 'deal', 'investment', 'consilium', 'command', 'general', 'organization'
  ));
