-- Restrict access to the encrypted stream key so no role short of
-- service_role (our server-side writer/reader) can read or write it.
-- The column now only stores AES-256-GCM ciphertext packed as
-- base64(iv).base64(tag).base64(ciphertext); the server handles
-- encrypt/decrypt via STREAM_KEY_ENCRYPTION_KEY.

revoke select (stream_key_encrypted) on players from authenticated, anon;
revoke update (stream_key_encrypted) on players from authenticated, anon;
revoke insert (stream_key_encrypted) on players from authenticated, anon;
