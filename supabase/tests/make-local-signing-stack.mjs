// Builds an ISOLATED local Supabase project folder for testing online signing.
// Nothing here touches the live project. See docs/portal-signing/SETUP.md.
//
//   node supabase/tests/make-local-signing-stack.mjs <target folder> <schema dump .sql>
//
// <schema dump .sql> is a schema-only copy of the live public schema (no data):
//   npx supabase db dump --linked --schema public -f <file>
// The repository has no base schema for bookings and the portal tables, so the
// local stack starts from that dump, adds the live storage bucket and policies,
// then applies the online signing migration.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [target, dump] = process.argv.slice(2);
if (!target || !dump || !fs.existsSync(dump)) {
  console.error("Usage: node supabase/tests/make-local-signing-stack.mjs <target folder> <schema dump .sql>");
  process.exit(2);
}
const dumpText = fs.readFileSync(dump, "utf8");
if (/^\s*(INSERT INTO|COPY )/m.test(dumpText)) {
  console.error("The dump contains data. Use a schema-only dump (supabase db dump without --data-only).");
  process.exit(2);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(path.resolve(target), "supabase");
fs.mkdirSync(path.join(out, "migrations"), { recursive: true });
fs.mkdirSync(path.join(out, "functions", "portal-sign"), { recursive: true });

// Config: its own project id, no seed file, analytics off, only portal-sign.
let config = fs.readFileSync(path.join(repo, "supabase", "config.toml"), "utf8").replaceAll("\r\n", "\n");
config = config.replace(/^project_id = .*$/m, 'project_id = "tn_signing_local"');
config = config.replace(/^sql_paths = \["\.\/seed\.sql"\]$/m, "sql_paths = []");
config = config.replace(/(\[analytics\]\nenabled = )true/, "$1false");
config = config.split(/\n(?=\[functions\.)/)[0];
config += '\n\n[functions.portal-sign]\nenabled = true\nverify_jwt = false\n';
// Lets the browser open the document and download links the local function makes.
config += '\n[edge_runtime.secrets]\nPORTAL_SIGN_PUBLIC_URL = "http://127.0.0.1:54321"\n';
fs.writeFileSync(path.join(out, "config.toml"), config);

const storageBaseline = `
-- LOCAL TEST ONLY: the live portal-uploads bucket and its storage policies (catalog snapshot 2026-11-07).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-uploads', 'portal-uploads', false, 10485760,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg'])
on conflict (id) do nothing;
create policy "Authenticated staff can delete portal staff documents" on storage.objects for delete to authenticated
  using ((bucket_id = 'portal-uploads') AND ((storage.foldername(name))[2] = 'staff-documents') AND public.can_manage_bookings());
create policy "Authenticated staff can upload portal staff documents" on storage.objects for insert to authenticated
  with check ((bucket_id = 'portal-uploads') AND ((storage.foldername(name))[2] = 'staff-documents') AND public.can_manage_bookings());
create policy "portal uploads guest cleanup" on storage.objects for delete to anon
  using ((bucket_id = 'portal-uploads') AND public.portal_upload_path_is_allowed(name));
create policy "portal uploads guest insert" on storage.objects for insert to anon, authenticated
  with check ((bucket_id = 'portal-uploads') AND public.portal_upload_path_is_allowed(name));
create policy "portal uploads staff delete" on storage.objects for delete to authenticated
  using ((bucket_id = 'portal-uploads') AND public.can_manage_bookings());
create policy "portal uploads staff read" on storage.objects for select to authenticated
  using ((bucket_id = 'portal-uploads') AND public.is_active_staff());
`;
/*
  Grants like live. A fresh local project grants anon, authenticated and
  service_role everything on new tables and functions; live does not (its
  service_role cannot even read portal_checklist_items). Clear those local
  defaults just before the dump's own GRANT/REVOKE section, so the dump's
  statements leave the same privileges as live. Without this, a function
  that works locally can fail live (security audit 2026-11-10, SEC-05).
*/
const liveGrants = `
-- LOCAL TEST ONLY: clear local default privileges so the grants below match live.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
`;
const grantsAt = dumpText.search(/^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES) /m);
const baseline = grantsAt < 0 ? `${dumpText}\n${liveGrants}` : `${dumpText.slice(0, grantsAt)}${liveGrants}\n${dumpText.slice(grantsAt)}`;
fs.writeFileSync(path.join(out, "migrations", "20260101000000_local_baseline.sql"), `${baseline}\n${storageBaseline}`);

// Fixture role for the test scripts (LOCAL_SEEDER_KEY), so service_role keeps the live grants the functions get.
fs.writeFileSync(path.join(out, "migrations", "20991231000000_local_test_seeder.sql"), `
-- LOCAL TEST ONLY.
do $$ begin create role test_seeder nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, storage to test_seeder;
grant all on all tables in schema public to test_seeder;
grant all on all sequences in schema public to test_seeder;
grant execute on all functions in schema public to test_seeder;
grant all on storage.objects, storage.buckets to test_seeder;
grant test_seeder to authenticator;
`);

const copy = (from, to) => fs.copyFileSync(path.join(repo, from), path.join(out, to));
// Not yet live: online signing and the 2026-11-10 hardening migrations.
for (const name of fs.readdirSync(path.join(repo, "supabase", "migrations"))) {
  if (name >= "20261107000100") copy(`supabase/migrations/${name}`, `migrations/${name}`);
}
copy("supabase/functions/portal-sign/index.ts", "functions/portal-sign/index.ts");
copy("supabase/functions/portal-sign/signing.js", "functions/portal-sign/signing.js");
fs.mkdirSync(path.join(out, "functions", "submit-guest-inquiry"), { recursive: true });
for (const name of ["index.ts", "deno.json"]) copy(`supabase/functions/submit-guest-inquiry/${name}`, `functions/submit-guest-inquiry/${name}`);
fs.appendFileSync(
  path.join(out, "config.toml"),
  '\n[functions.submit-guest-inquiry]\nenabled = true\nverify_jwt = false\nimport_map = "./functions/submit-guest-inquiry/deno.json"\n'
);

console.log(`Local stack folder ready: ${path.resolve(target)}`);
console.log("Next: npx supabase start --workdir <that folder> -x realtime,studio,imgproxy,vector,supavisor,postgres-meta,mailpit,logflare");
console.log("After editing the function in the repo, run this script again and restart the edge runtime container.");
console.log("Fixture key for the tests: an HS256 JWT with role test_seeder, signed with the stack's JWT_SECRET (see docs/audit/SECURITY_AUDIT_2026-11-10.md).");
