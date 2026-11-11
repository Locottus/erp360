"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_service_1 = require("../common/database.service");
function readOptions(args) {
    if (!args.includes('--confirm-platform-operator')) {
        throw new Error('Pass --confirm-platform-operator to make an explicit local provisioning change.');
    }
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--email' || arg === '--role') {
            if (!args[index + 1] || args[index + 1].startsWith('--')) {
                throw new Error(`${arg} requires a value.`);
            }
            index += 1;
        }
        else if (arg !== '--disable' && arg !== '--confirm-platform-operator') {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    if (args.filter((arg) => arg === '--email').length !== 1 ||
        args.filter((arg) => arg === '--role').length > 1) {
        throw new Error('Provide exactly one --email and at most one --role.');
    }
    const emailIndex = args.indexOf('--email');
    const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
    if (!email ||
        email.startsWith('--') ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Usage: provision-operator --email existing.user@example.com --role owner|billing|viewer --confirm-platform-operator');
    }
    const disable = args.includes('--disable');
    const roleIndex = args.indexOf('--role');
    const rawRole = roleIndex >= 0 ? args[roleIndex + 1] : undefined;
    if (disable && rawRole !== undefined) {
        throw new Error('Do not pass --role with --disable.');
    }
    if (!disable && !['owner', 'billing', 'viewer'].includes(String(rawRole))) {
        throw new Error('Select exactly one --role owner, --role billing, or --role viewer.');
    }
    if (disable && !args.includes('--confirm-platform-operator')) {
        throw new Error('Pass --confirm-platform-operator to disable a platform membership.');
    }
    return {
        email: email.toLowerCase(),
        role: rawRole,
        disable,
    };
}
async function provision(options) {
    const db = new database_service_1.DatabaseService();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('saas-operator-provisioning'))");
        const userResult = await client.query(`SELECT id, email, is_active FROM users WHERE lower(email) = $1 FOR UPDATE`, [options.email]);
        const target = userResult.rows[0];
        if (!target || !target.is_active) {
            throw new Error('No active existing user matches that email.');
        }
        const currentResult = await client.query(`SELECT role, enabled FROM platform_saas_operators WHERE user_id = $1 FOR UPDATE`, [target.id]);
        const current = currentResult.rows[0];
        if (options.disable && !current) {
            throw new Error('That user does not have a platform SaaS membership.');
        }
        const countResult = await client.query(`SELECT COUNT(*)::integer AS enabled_owners
       FROM platform_saas_operators WHERE enabled = TRUE AND role = 'owner'`);
        const enabledOwners = countResult.rows[0].enabled_owners;
        const nextRole = options.disable ? current?.role : options.role;
        const nextEnabled = !options.disable;
        if (!options.disable && enabledOwners === 0 && nextRole !== 'owner') {
            throw new Error('The first enabled platform operator must have the owner role.');
        }
        if (current?.enabled &&
            current.role === 'owner' &&
            (!nextEnabled || nextRole !== 'owner') &&
            enabledOwners <= 1) {
            throw new Error('Cannot disable or demote the last enabled platform owner.');
        }
        const changed = !current || current.role !== nextRole || current.enabled !== nextEnabled;
        if (!changed) {
            await client.query('COMMIT');
            console.log(`No change: ${target.email} already has the requested platform SaaS membership.`);
            return;
        }
        if (options.disable) {
            await client.query(`UPDATE platform_saas_operators
         SET enabled = FALSE, updated_by = $2, updated_at = NOW()
         WHERE user_id = $1`, [target.id, target.id]);
        }
        else {
            await client.query(`INSERT INTO platform_saas_operators(user_id, role, enabled, created_by, updated_by)
         VALUES ($1, $2, TRUE, $1, $1)
         ON CONFLICT (user_id) DO UPDATE
         SET role = EXCLUDED.role, enabled = TRUE, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [target.id, options.role]);
        }
        await client.query(`INSERT INTO saas_audit_events(
         actor_user_id, action, entity_type, entity_id, payload
       )
       VALUES ($1, $2, 'platform_operator', $1, $3::jsonb)`, [
            target.id,
            options.disable
                ? 'operator.disabled'
                : current
                    ? 'operator.role_changed'
                    : 'operator.provisioned',
            JSON.stringify({
                email: target.email,
                previous_role: current?.role ?? null,
                previous_enabled: current?.enabled ?? false,
                role: nextRole,
                enabled: nextEnabled,
                provisioning_source: 'explicit_local_cli',
            }),
        ]);
        await client.query('COMMIT');
        console.log(`${options.disable ? 'Disabled' : 'Provisioned'} ${target.email}: role=${nextRole ?? current?.role}, enabled=${nextEnabled}.`);
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
        await db.onModuleDestroy();
    }
}
async function main() {
    try {
        await provision(readOptions(process.argv.slice(2)));
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : 'Operator provisioning failed.');
        process.exitCode = 1;
    }
}
void main();
//# sourceMappingURL=provision-operator.js.map