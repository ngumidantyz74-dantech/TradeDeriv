import { Router, type Response } from 'express';
import { query, queryOne, execute, withTransaction, requireDb, logAdminAction } from '../db.ts';
import { randomId } from '../crypto.ts';
import { hashPasswordArgon2id, verifyPasswordHash } from '../password-hash.ts';
import {
  requireAdmin,
  verifyAdminReauthToken,
  invalidateAuthUserCache,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  ALL_PERMISSION_KEYS,
  DEVICE_COOKIE_NAME,
  getDeviceCookieOptions,
  getAdminRequestContext,
  invalidateAdminSecurityCaches,
  invalidateAllDeviceCaches,
  logDeviceActivity,
  requirePermission,
  requireSuperAdmin,
  resolveVerifiedDevice,
  revokeAdminSessionByJti,
  revokeAllSessionsForAdmin,
  revokeSessionsForDevice,
  sha256Hex,
  signDeviceCredentialToken,
} from '../rbac-device.ts';

const router = Router();

const reqIp = (req: AuthRequest): string =>
  String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();

function checkReauth(req: AuthRequest, res: Response): boolean {
  const token = String(req.headers['x-admin-reauth'] || '').trim();
  if (!verifyAdminReauthToken(token, req.user!.id)) {
    res.status(428).json({
      error: 'Re-authentication required for sensitive admin operation.',
      code: 'REAUTH_REQUIRED',
    });
    return false;
  }
  return true;
}

// =========================================================================
// 1. DEVICE STATUS & CRYPTOGRAPHIC ENROLLMENT / REPLACEMENT VERIFICATION
// =========================================================================

router.get('/admin/devices/status', requireDb, async (req, res) => {
  const check = await resolveVerifiedDevice(req);
  if (!check.ok || !check.device) {
    res.json({ verified: false, device: null, reason: check.reason });
    return;
  }
  res.json({
    verified: true,
    device: {
      id: check.device.id,
      device_uid: check.device.device_uid,
      device_name: check.device.device_name,
      device_type: check.device.device_type,
      platform: check.device.platform,
      verification_status: check.device.verification_status,
    },
    reason: 'verified',
  });
});

router.post('/admin/devices/enroll', requireDb, async (req: AuthRequest, res) => {
  const { enrollmentToken, email, password, deviceLabel, platform } = req.body || {};
  const cleanToken = String(enrollmentToken || '').trim();
  if (!cleanToken) {
    res.status(400).json({ error: 'One-time device enrollment token is required.' });
    return;
  }

  const tokenHash = sha256Hex(cleanToken);
  const ip = reqIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 240);

  const dev = await queryOne<any>(
    `SELECT id, device_uid, device_name, device_type, platform, credential_hash,
            enrollment_expires_at, verification_status, is_active, revoked_at, owner_admin_id
     FROM registered_devices
     WHERE enrollment_token_hash = $1`,
    [tokenHash]
  );

  if (!dev) {
    res.status(401).json({ error: 'Invalid or already used device enrollment token.' });
    return;
  }
  if (!dev.is_active || dev.revoked_at || dev.verification_status === 'revoked') {
    res.status(403).json({ error: 'This device has been revoked by the Super Admin.' });
    return;
  }
  if (dev.enrollment_expires_at && new Date(dev.enrollment_expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: 'Device enrollment token has expired. Request a new token from the Super Admin.' });
    return;
  }

  // If device already had an enrolled credential (replacement / re-enrollment), require additional credential verification
  const isReplacement = Boolean(dev.credential_hash) || dev.verification_status === 're_enrollment_required';
  let verifiedActorId: number | null = null;

  if (isReplacement) {
    if (!email || !password) {
      res.status(403).json({
        error: 'Device replacement requires administrator email and password verification alongside the re-enrollment token.',
        code: 'REENROLL_CREDENTIALS_REQUIRED',
      });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const adm = await queryOne<{ id: number; role: string; status: string; password_hash: string }>(
      "SELECT id, role, status, password_hash FROM users WHERE email = $1 AND role IN ('owner', 'admin')",
      [cleanEmail]
    );
    if (!adm || adm.status !== 'active') {
      res.status(403).json({ error: 'Valid active administrator credentials required for device replacement.' });
      return;
    }
    const pwRes = await verifyPasswordHash(String(password), adm.password_hash);
    if (!pwRes.valid) {
      res.status(401).json({ error: 'Administrator password verification failed during device replacement.' });
      return;
    }
    if (adm.role !== 'owner') {
      const assigned = await queryOne<{ id: number }>(
        'SELECT id FROM admin_devices WHERE admin_user_id = $1 AND device_id = $2 AND is_active = TRUE AND revoked_at IS NULL',
        [adm.id, dev.id]
      );
      if (!assigned) {
        res.status(403).json({ error: 'This administrator is not assigned to the device being replaced.' });
        return;
      }
    }
    verifiedActorId = adm.id;
  }

  const rawSecret = randomId(32);
  const credentialHash = sha256Hex(rawSecret);

  const updated = await queryOne<any>(
    `UPDATE registered_devices
     SET credential_hash = $1,
         enrollment_token_hash = NULL,
         enrollment_expires_at = NULL,
         verification_status = 'verified',
         is_active = TRUE,
         enrolled_at = NOW(),
         last_seen_at = NOW(),
         last_ip = $2,
         user_agent_hint = $3,
         device_name = COALESCE(NULLIF($4, ''), device_name),
         platform = COALESCE(NULLIF($5, ''), platform),
         updated_at = NOW()
     WHERE id = $6
     RETURNING id, device_uid, device_name, device_type, platform, verification_status, is_active, enrolled_at`,
    [
      credentialHash,
      ip,
      ua,
      deviceLabel ? String(deviceLabel).trim().slice(0, 120) : '',
      platform ? String(platform).trim().slice(0, 40) : '',
      dev.id,
    ]
  );

  const signedCred = signDeviceCredentialToken(dev.device_uid, rawSecret);
  res.cookie(DEVICE_COOKIE_NAME, signedCred, getDeviceCookieOptions(req));
  invalidateAdminSecurityCaches({ deviceUid: dev.device_uid });

  await logDeviceActivity({
    deviceId: dev.id,
    adminUserId: verifiedActorId || dev.owner_admin_id,
    actorAdminId: verifiedActorId,
    eventType: isReplacement ? 'device_re_enrolled' : 'device_enrolled',
    ipAddress: ip,
    userAgent: ua,
    details: { deviceUid: dev.device_uid, isReplacement },
  });

  await logAdminAction(
    verifiedActorId || dev.owner_admin_id || null,
    isReplacement ? 'device_re_enrolled' : 'device_enrolled',
    'registered_devices',
    String(dev.id),
    { deviceUid: dev.device_uid, isReplacement },
    { ipAddress: ip, actionResult: 'success', deviceId: dev.id }
  );

  res.json({
    ok: true,
    device: updated,
    deviceCredential: signedCred,
  });
});

// =========================================================================
// 2. RBAC ROLES & PERMISSIONS CRUD (SUPER ADMIN ONLY)
// =========================================================================

router.get('/admin/roles', requireDb, requireAdmin, requireSuperAdmin, async (_req, res) => {
  const [roles, rolePerms, catalog, counts] = await Promise.all([
    query('SELECT id, name, slug, description, is_system, is_active, created_at, updated_at FROM admin_roles ORDER BY is_system DESC, id ASC'),
    query('SELECT role_id, permission_key FROM role_permissions ORDER BY role_id ASC, permission_key ASC'),
    query('SELECT key, module, label, description FROM permissions ORDER BY module ASC, key ASC'),
    query<{ admin_role_id: number; cnt: number }>(
      "SELECT admin_role_id, COUNT(*)::int as cnt FROM users WHERE role IN ('owner', 'admin') AND admin_role_id IS NOT NULL GROUP BY admin_role_id"
    ),
  ]);

  const permsByRole = new Map<number, string[]>();
  for (const rp of rolePerms) {
    const list = permsByRole.get(rp.role_id) || [];
    list.push(rp.permission_key);
    permsByRole.set(rp.role_id, list);
  }
  const countMap = new Map<number, number>(counts.map((c) => [c.admin_role_id, c.cnt]));

  res.json({
    roles: roles.map((r: any) => ({
      ...r,
      permissions: r.slug === 'super_admin' ? [...ALL_PERMISSION_KEYS] : permsByRole.get(r.id) || [],
      adminCount: countMap.get(r.id) || 0,
    })),
    permissionsCatalog: catalog,
  });
});

router.post('/admin/roles', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const { name, description = '', permissions = [] } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    res.status(400).json({ error: 'Role name (min 2 chars) is required.' });
    return;
  }
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug || slug === 'super_admin') {
    res.status(400).json({ error: 'Invalid or reserved role slug.' });
    return;
  }

  const validPerms = Array.from(
    new Set(
      (Array.isArray(permissions) ? permissions : [])
        .map((p) => String(p).trim())
        .filter((p) => (ALL_PERMISSION_KEYS as readonly string[]).includes(p))
    )
  );

  try {
    const created = await withTransaction(async (client) => {
      const roleRes = await client.query<any>(
        `INSERT INTO admin_roles (name, slug, description, is_system, is_active)
         VALUES ($1, $2, $3, FALSE, TRUE)
         RETURNING id, name, slug, description, is_system, is_active, created_at`,
        [cleanName, slug, String(description || '').slice(0, 240)]
      );
      const role = roleRes.rows[0];
      for (const pKey of validPerms) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [role.id, pKey]
        );
      }
      return role;
    });

    await logAdminAction(
      ctx.userId,
      'create_rbac_role',
      'admin_roles',
      String(created.id),
      { name: cleanName, permissions: validPerms },
      { previousValue: 'none', newValue: `${cleanName} (${validPerms.length} perms)`, ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
    );

    res.status(201).json({ role: { ...created, permissions: validPerms } });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create role' });
  }
});

router.put('/admin/roles/:id', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const roleId = Number(req.params.id);
  const { name, description, permissions, is_active } = req.body || {};

  const existing = await queryOne<any>('SELECT id, name, slug, is_system FROM admin_roles WHERE id = $1', [roleId]);
  if (!existing) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }
  if (existing.slug === 'super_admin') {
    res.status(403).json({ error: 'System Super Admin role permissions cannot be restricted.' });
    return;
  }

  const prevPerms = await query<{ permission_key: string }>(
    'SELECT permission_key FROM role_permissions WHERE role_id = $1',
    [roleId]
  );

  const validPerms = Array.isArray(permissions)
    ? Array.from(
        new Set(
          permissions
            .map((p) => String(p).trim())
            .filter((p) => (ALL_PERMISSION_KEYS as readonly string[]).includes(p))
        )
      )
    : null;

  const updated = await withTransaction(async (client) => {
    const rowRes = await client.query<any>(
      `UPDATE admin_roles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, slug, description, is_system, is_active, updated_at`,
      [
        name !== undefined ? String(name).trim().slice(0, 80) : null,
        description !== undefined ? String(description).slice(0, 240) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        roleId,
      ]
    );
    if (validPerms !== null) {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      for (const pKey of validPerms) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, pKey]
        );
      }
    }
    return rowRes.rows[0];
  });

  // Immediate cache invalidation so delegated admin permissions apply immediately
  invalidateAdminSecurityCaches();

  const finalPerms = validPerms ?? prevPerms.map((p) => p.permission_key);
  await logAdminAction(
    ctx.userId,
    'update_rbac_role',
    'admin_roles',
    String(roleId),
    { permissions: finalPerms },
    {
      previousValue: `${prevPerms.length} perms`,
      newValue: `${finalPerms.length} perms (${updated.name})`,
      ipAddress: reqIp(req),
      actionResult: 'success',
      actorRole: ctx.adminRoleSlug,
    }
  );

  res.json({ role: { ...updated, permissions: finalPerms } });
});

router.delete('/admin/roles/:id', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const roleId = Number(req.params.id);
  const existing = await queryOne<any>('SELECT id, name, is_system FROM admin_roles WHERE id = $1', [roleId]);
  if (!existing) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }
  if (existing.is_system) {
    res.status(403).json({ error: 'System roles cannot be deleted.' });
    return;
  }
  const inUse = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*)::int as cnt FROM users WHERE admin_role_id = $1 AND role IN ('owner', 'admin')",
    [roleId]
  );
  if ((inUse?.cnt || 0) > 0) {
    res.status(409).json({ error: 'Reassign administrators away from this role before deleting it.' });
    return;
  }

  await execute('DELETE FROM admin_roles WHERE id = $1', [roleId]);
  invalidateAdminSecurityCaches();

  await logAdminAction(
    ctx.userId,
    'delete_rbac_role',
    'admin_roles',
    String(roleId),
    { name: existing.name },
    { previousValue: existing.name, newValue: 'deleted', ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
  );

  res.json({ ok: true });
});

// =========================================================================
// 3. ADMINISTRATOR MANAGEMENT & LIFECYCLE (SUPER ADMIN ONLY)
// =========================================================================

router.get('/admin/admins', requireDb, requireAdmin, requireSuperAdmin, async (_req, res) => {
  const [admins, deviceMappings, clientCounts, activeSessions] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.admin_role_id, u.created_at, u.last_login_at, u.deactivated_at,
              COALESCE(a.username, SPLIT_PART(u.email, '@', 1)) as username,
              COALESCE(a.notes, '') as notes,
              COALESCE(ar.name, CASE WHEN u.role = 'owner' THEN 'Super Admin' ELSE 'Delegated Admin' END) as role_name,
              COALESCE(ar.slug, CASE WHEN u.role = 'owner' THEN 'super_admin' ELSE 'delegated_operator' END) as role_slug
       FROM users u
       LEFT JOIN administrators a ON a.user_id = u.id
       LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
       WHERE u.role IN ('owner', 'admin')
       ORDER BY CASE WHEN u.role = 'owner' THEN 0 ELSE 1 END, u.id ASC`
    ),
    query(
      `SELECT ad.admin_user_id, rd.id as device_id, rd.device_uid, rd.device_name, rd.device_type,
              rd.platform, rd.verification_status, rd.is_active
       FROM admin_devices ad
       JOIN registered_devices rd ON rd.id = ad.device_id
       WHERE ad.is_active = TRUE AND ad.revoked_at IS NULL`
    ),
    query<{ admin_user_id: number; cnt: number }>(
      `SELECT caa.admin_user_id, COUNT(DISTINCT caa.user_id)::int as cnt
       FROM client_admin_assignments caa
       JOIN users u ON u.id = caa.user_id
       WHERE caa.is_active = TRUE AND caa.revoked_at IS NULL AND u.role NOT IN ('owner', 'admin')
       GROUP BY caa.admin_user_id`
    ),
    query<{ admin_user_id: number; cnt: number }>(
      `SELECT admin_user_id, COUNT(*)::int as cnt
       FROM admin_sessions
       WHERE revoked_at IS NULL AND status = 'active' AND expires_at > NOW()
       GROUP BY admin_user_id`
    ),
  ]);

  const devMap = new Map<number, any[]>();
  for (const dm of deviceMappings) {
    const arr = devMap.get(dm.admin_user_id) || [];
    arr.push(dm);
    devMap.set(dm.admin_user_id, arr);
  }
  const clientMap = new Map<number, number>(clientCounts.map((c) => [c.admin_user_id, c.cnt]));
  const sessMap = new Map<number, number>(activeSessions.map((s) => [s.admin_user_id, s.cnt]));

  res.json({
    admins: admins.map((adm: any) => ({
      ...adm,
      assignedDevices: devMap.get(adm.id) || [],
      managedClientCount: clientMap.get(adm.id) || 0,
      activeSessionCount: sessMap.get(adm.id) || 0,
    })),
  });
});

router.post('/admin/admins', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  if (!checkReauth(req, res)) return;
  const ctx = getAdminRequestContext(req)!;
  const { email, password, full_name = 'Delegated Admin', username, admin_role_id, deviceIds = [], notes = '' } = req.body || {};

  if (!email || !password || String(password).length < 8) {
    res.status(400).json({ error: 'Email and strong password (min 8 chars) are required.' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const exists = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
  if (exists) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  let resolvedRoleId = admin_role_id ? Number(admin_role_id) : null;
  if (resolvedRoleId) {
    const roleCheck = await queryOne<{ id: number; slug: string }>('SELECT id, slug FROM admin_roles WHERE id = $1', [resolvedRoleId]);
    if (!roleCheck) {
      res.status(400).json({ error: 'Selected RBAC role does not exist.' });
      return;
    }
    if (roleCheck.slug === 'super_admin') {
      res.status(403).json({ error: 'Delegated administrators cannot be assigned the system Super Admin role.' });
      return;
    }
  } else {
    const defRole = await queryOne<{ id: number }>("SELECT id FROM admin_roles WHERE slug = 'delegated_operator' LIMIT 1");
    resolvedRoleId = defRole?.id ?? null;
  }

  const hash = await hashPasswordArgon2id(String(password));
  const cleanUsername = String(username || cleanEmail.split('@')[0]).trim().slice(0, 60);

  const created = await withTransaction(async (client) => {
    const uRes = await client.query<any>(
      `INSERT INTO users (email, password_hash, full_name, deriv_nickname, role, admin_role_id, status, email_verified, virtual_workspace_balance, deriv_client_id)
       VALUES ($1, $2, $3, $4, 'admin', $5, 'active', TRUE, 0, $6)
       RETURNING id, email, full_name, role, admin_role_id, status, created_at`,
      [cleanEmail, hash, String(full_name).trim(), cleanUsername, resolvedRoleId, `ADM-${randomId(3).toUpperCase()}`]
    );
    const adm = uRes.rows[0];

    await client.query(
      `INSERT INTO administrators (user_id, admin_role_id, username, status, notes, created_by_admin_id)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [adm.id, resolvedRoleId, cleanUsername, String(notes || '').slice(0, 240), ctx.userId]
    );

    if (Array.isArray(deviceIds)) {
      for (const rawDid of deviceIds) {
        const did = Number(rawDid);
        if (!did) continue;
        await client.query(
          `INSERT INTO admin_devices (admin_user_id, device_id, assigned_by_admin_id, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (admin_user_id, device_id) DO UPDATE SET
             is_active = TRUE, revoked_at = NULL, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id, assigned_at = NOW()`,
          [adm.id, did, ctx.userId]
        );
      }
    }
    return adm;
  });

  invalidateAdminSecurityCaches();
  await logAdminAction(
    ctx.userId,
    'create_delegated_admin',
    'users',
    String(created.id),
    { email: cleanEmail, admin_role_id: resolvedRoleId, deviceIds },
    { previousValue: 'none', newValue: `${cleanEmail} (roleId=${resolvedRoleId})`, ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
  );

  res.status(201).json({ admin: created });
});

router.patch('/admin/admins/:id', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const targetId = Number(req.params.id);
  const { full_name, email, username, admin_role_id, status, password, notes } = req.body || {};

  const target = await queryOne<any>('SELECT id, email, role, status, admin_role_id FROM users WHERE id = $1 AND role IN (\'owner\', \'admin\')', [targetId]);
  if (!target) {
    res.status(404).json({ error: 'Administrator not found.' });
    return;
  }
  if (target.role === 'owner' && (status && status !== 'active')) {
    res.status(403).json({ error: 'Primary Super Admin cannot be suspended or deactivated.' });
    return;
  }
  if (status && !['active', 'deactivated', 'suspended'].includes(String(status))) {
    res.status(400).json({ error: 'Invalid administrator status.' });
    return;
  }
  if (admin_role_id !== undefined && target.role !== 'owner') {
    const r = await queryOne<{ slug: string }>('SELECT slug FROM admin_roles WHERE id = $1', [Number(admin_role_id)]);
    if (!r) {
      res.status(400).json({ error: 'Target RBAC role not found.' });
      return;
    }
    if (r.slug === 'super_admin') {
      res.status(403).json({ error: 'Cannot elevate a delegated admin to system Super Admin role.' });
      return;
    }
  }

  let pwHash: string | null = null;
  if (password && String(password).trim().length >= 8) {
    if (!checkReauth(req, res)) return;
    pwHash = await hashPasswordArgon2id(String(password).trim());
  }

  const updated = await withTransaction(async (client) => {
    const uRes = await client.query<any>(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        deriv_nickname = COALESCE($3, deriv_nickname),
        admin_role_id = COALESCE($4, admin_role_id),
        status = COALESCE($5, status),
        deactivated_at = CASE WHEN $5 = 'deactivated' THEN NOW() WHEN $5 = 'active' THEN NULL ELSE deactivated_at END,
        password_hash = COALESCE($6, password_hash),
        updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, full_name, role, admin_role_id, status, updated_at`,
      [
        full_name !== undefined ? String(full_name).trim().slice(0, 120) : null,
        email !== undefined ? String(email).trim().toLowerCase() : null,
        username !== undefined ? String(username).trim().slice(0, 60) : null,
        admin_role_id !== undefined && target.role !== 'owner' ? Number(admin_role_id) : null,
        status ? String(status) : null,
        pwHash,
        targetId,
      ]
    );

    await client.query(
      `INSERT INTO administrators (user_id, admin_role_id, username, status, notes)
       VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, 'active'), COALESCE($5, ''))
       ON CONFLICT (user_id) DO UPDATE SET
         admin_role_id = COALESCE($2, administrators.admin_role_id),
         username = COALESCE($3, administrators.username),
         status = COALESCE($4, administrators.status),
         notes = COALESCE($5, administrators.notes),
         updated_at = NOW()`,
      [
        targetId,
        admin_role_id !== undefined && target.role !== 'owner' ? Number(admin_role_id) : target.admin_role_id,
        username !== undefined ? String(username).trim().slice(0, 60) : null,
        status ? String(status) : null,
        notes !== undefined ? String(notes).slice(0, 240) : null,
      ]
    );

    if (status && status !== 'active') {
      await revokeAllSessionsForAdmin(targetId, ctx.userId, `admin_${status}`, client);
    }

    return uRes.rows[0];
  });

  invalidateAuthUserCache(targetId);
  invalidateAdminSecurityCaches({ adminUserId: targetId });

  await logAdminAction(
    ctx.userId,
    'update_delegated_admin',
    'users',
    String(targetId),
    { status: updated.status, admin_role_id: updated.admin_role_id },
    {
      previousValue: `status=${target.status}, roleId=${target.admin_role_id}`,
      newValue: `status=${updated.status}, roleId=${updated.admin_role_id}`,
      ipAddress: reqIp(req),
      actionResult: 'success',
      actorRole: ctx.adminRoleSlug,
    }
  );

  res.json({ admin: updated });
});

router.post('/admin/admins/:id/revoke-sessions', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const targetId = Number(req.params.id);
  await revokeAllSessionsForAdmin(targetId, ctx.userId, 'super_admin_forced_logout');
  invalidateAuthUserCache(targetId);
  await logAdminAction(
    ctx.userId,
    'revoke_admin_sessions',
    'admin_sessions',
    String(targetId),
    { targetAdminId: targetId },
    { ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
  );
  res.json({ ok: true });
});

router.get('/admin/admins/:id/activity', requireDb, requireAdmin, requireSuperAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const [admin, devices, clients, sessions, auditLogs, deviceLogs] = await Promise.all([
    queryOne(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.last_login_at, u.created_at,
              ar.name as role_name, ar.slug as role_slug
       FROM users u LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
       WHERE u.id = $1 AND u.role IN ('owner', 'admin')`,
      [targetId]
    ),
    query(
      `SELECT rd.id, rd.device_uid, rd.device_name, rd.device_type, rd.verification_status, ad.is_active, ad.assigned_at, ad.revoked_at
       FROM admin_devices ad JOIN registered_devices rd ON rd.id = ad.device_id
       WHERE ad.admin_user_id = $1 ORDER BY ad.assigned_at DESC LIMIT 30`,
      [targetId]
    ),
    query(
      `SELECT u.id, u.email, u.full_name, u.deriv_client_id, u.ownership_verification_status, caa.is_active, caa.assigned_at
       FROM client_admin_assignments caa JOIN users u ON u.id = caa.user_id
       WHERE caa.admin_user_id = $1 AND caa.is_active = TRUE ORDER BY caa.assigned_at DESC LIMIT 50`,
      [targetId]
    ),
    query(
      `SELECT s.session_jti, s.device_id, rd.device_uid, s.ip_address, s.user_agent, s.status, s.created_at, s.expires_at, s.revoked_at
       FROM admin_sessions s LEFT JOIN registered_devices rd ON rd.id = s.device_id
       WHERE s.admin_user_id = $1 ORDER BY s.created_at DESC LIMIT 30`,
      [targetId]
    ),
    query(
      `SELECT id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, created_at
       FROM administrator_audit_logs WHERE admin_user_id = $1 ORDER BY id DESC LIMIT 40`,
      [targetId]
    ),
    query(
      `SELECT id, device_id, event_type, ip_address, details_json, created_at
       FROM device_activity_logs WHERE admin_user_id = $1 ORDER BY id DESC LIMIT 40`,
      [targetId]
    ),
  ]);

  if (!admin) {
    res.status(404).json({ error: 'Administrator not found' });
    return;
  }
  res.json({ admin, devices, clients, sessions, auditLogs, deviceLogs });
});

router.delete('/admin/admins/:id', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  if (!checkReauth(req, res)) return;
  const ctx = getAdminRequestContext(req)!;
  const targetId = Number(req.params.id);

  if (targetId === ctx.userId) {
    res.status(400).json({ error: 'Cannot delete your own Super Admin account.' });
    return;
  }
  const target = await queryOne<{ id: number; email: string; role: string }>(
    "SELECT id, email, role FROM users WHERE id = $1 AND role IN ('owner', 'admin')",
    [targetId]
  );
  if (!target) {
    res.status(404).json({ error: 'Administrator not found.' });
    return;
  }
  if (target.role === 'owner') {
    res.status(403).json({ error: 'Primary Super Admin account cannot be deleted.' });
    return;
  }

  await withTransaction(async (client) => {
    await revokeAllSessionsForAdmin(targetId, ctx.userId, 'admin_deleted', client);
    await client.query(
      'UPDATE admin_devices SET is_active = FALSE, revoked_at = NOW() WHERE admin_user_id = $1 AND is_active = TRUE',
      [targetId]
    );
    await client.query(
      `UPDATE client_admin_assignments
       SET is_active = FALSE, revoked_at = NOW()
       WHERE admin_user_id = $1 AND is_active = TRUE`,
      [targetId]
    );
    await client.query(
      `UPDATE users
       SET assigned_admin_id = NULL,
           ownership_verification_status = 'pending_verification',
           updated_at = NOW()
       WHERE assigned_admin_id = $1`,
      [targetId]
    );
    await client.query('DELETE FROM users WHERE id = $1', [targetId]);
  });

  invalidateAuthUserCache(targetId);
  invalidateAdminSecurityCaches();

  await logAdminAction(
    ctx.userId,
    'delete_delegated_admin',
    'users',
    String(targetId),
    { email: target.email },
    { previousValue: target.email, newValue: 'deleted (clients marked pending_verification)', ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
  );

  res.json({ ok: true });
});

// =========================================================================
// 4. DEVICE REGISTRATION, ASSIGNMENT, REASSIGNMENT & REVOCATION
// =========================================================================

router.get('/admin/devices', requireDb, requireAdmin, requirePermission('devices.view'), async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const params: unknown[] = [];
  let whereSql = 'TRUE';
  if (!ctx.isSuperAdmin) {
    params.push(ctx.userId);
    whereSql = `EXISTS (
      SELECT 1 FROM admin_devices ad2
      WHERE ad2.device_id = rd.id AND ad2.admin_user_id = $1 AND ad2.is_active = TRUE AND ad2.revoked_at IS NULL
    )`;
  }

  const [devices, adminLinks, clientCounts] = await Promise.all([
    query(
      `SELECT rd.id, rd.device_uid, rd.device_name, rd.device_type, rd.platform,
              rd.verification_status, rd.is_active, rd.owner_admin_id,
              rd.enrolled_at, rd.last_seen_at, rd.last_ip, rd.revoked_at, rd.revoked_reason, rd.created_at
       FROM registered_devices rd
       WHERE ${whereSql}
       ORDER BY rd.id DESC LIMIT 120`,
      params
    ),
    query(
      `SELECT ad.device_id, ad.admin_user_id, u.email, u.full_name, u.status as admin_status, ad.assigned_at
       FROM admin_devices ad
       JOIN users u ON u.id = ad.admin_user_id
       WHERE ad.is_active = TRUE AND ad.revoked_at IS NULL`
    ),
    query<{ device_id: number; cnt: number }>(
      `SELECT cda.device_id, COUNT(DISTINCT cda.user_id)::int as cnt
       FROM client_device_assignments cda
       JOIN users u ON u.id = cda.user_id
       WHERE cda.is_active = TRUE AND cda.revoked_at IS NULL AND u.role NOT IN ('owner', 'admin')
       GROUP BY cda.device_id`
    ),
  ]);

  const adminsByDev = new Map<number, any[]>();
  for (const al of adminLinks) {
    const arr = adminsByDev.get(al.device_id) || [];
    arr.push(al);
    adminsByDev.set(al.device_id, arr);
  }
  const countMap = new Map<number, number>(clientCounts.map((c) => [c.device_id, c.cnt]));

  res.json({
    devices: devices.map((d: any) => ({
      ...d,
      assignedAdmins: adminsByDev.get(d.id) || [],
      connectedClientCount: countMap.get(d.id) || 0,
    })),
  });
});

router.post('/admin/devices', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const { device_name, device_type = 'browser', platform = 'web', assignAdminId } = req.body || {};
  const cleanName = String(device_name || '').trim();
  if (!cleanName) {
    res.status(400).json({ error: 'Device name is required.' });
    return;
  }

  const deviceUid = `DEV-${randomId(2).toUpperCase()}-${randomId(3).toUpperCase()}`;
  const rawEnrollToken = `tdv_enr_${randomId(18)}`;
  const enrollHash = sha256Hex(rawEnrollToken);
  const targetAdminId = assignAdminId ? Number(assignAdminId) : null;

  if (targetAdminId) {
    const adm = await queryOne("SELECT id FROM users WHERE id = $1 AND role IN ('owner', 'admin')", [targetAdminId]);
    if (!adm) {
      res.status(404).json({ error: 'Target administrator not found.' });
      return;
    }
  }

  const created = await withTransaction(async (client) => {
    const devRes = await client.query<any>(
      `INSERT INTO registered_devices
        (device_uid, device_name, device_type, platform, enrollment_token_hash, enrollment_expires_at,
         verification_status, is_active, owner_admin_id, registered_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '48 hours', 'pending_enrollment', TRUE, $6, $7)
       RETURNING id, device_uid, device_name, device_type, platform, verification_status, is_active, owner_admin_id, created_at`,
      [
        deviceUid,
        cleanName.slice(0, 120),
        ['browser', 'desktop', 'mobile', 'terminal'].includes(String(device_type)) ? String(device_type) : 'browser',
        String(platform || 'web').slice(0, 40),
        enrollHash,
        targetAdminId,
        ctx.userId,
      ]
    );
    const dev = devRes.rows[0];
    if (targetAdminId) {
      await client.query(
        `INSERT INTO admin_devices (admin_user_id, device_id, assigned_by_admin_id, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (admin_user_id, device_id) DO UPDATE SET is_active = TRUE, revoked_at = NULL`,
        [targetAdminId, dev.id, ctx.userId]
      );
    }
    await logDeviceActivity({
      deviceId: dev.id,
      adminUserId: targetAdminId,
      actorAdminId: ctx.userId,
      eventType: 'device_registered',
      ipAddress: reqIp(req),
      details: { deviceUid, targetAdminId },
      client,
    });
    return dev;
  });

  invalidateAllDeviceCaches();
  await logAdminAction(
    ctx.userId,
    'register_device',
    'registered_devices',
    String(created.id),
    { deviceUid, deviceName: cleanName, targetAdminId },
    { previousValue: 'none', newValue: `${deviceUid} (${cleanName})`, ipAddress: reqIp(req), actionResult: 'success', deviceId: created.id, actorRole: ctx.adminRoleSlug }
  );

  res.status(201).json({
    device: created,
    enrollmentToken: rawEnrollToken,
  });
});

router.post('/admin/devices/:id/enrollment-token', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  const existing = await queryOne<any>('SELECT id, device_uid, credential_hash, is_active FROM registered_devices WHERE id = $1', [deviceId]);
  if (!existing) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const rawEnrollToken = `tdv_enr_${randomId(18)}`;
  const enrollHash = sha256Hex(rawEnrollToken);
  const isReplacement = Boolean(existing.credential_hash);

  await execute(
    `UPDATE registered_devices
     SET enrollment_token_hash = $1,
         enrollment_expires_at = NOW() + INTERVAL '48 hours',
         verification_status = $2,
         is_active = TRUE,
         revoked_at = NULL,
         updated_at = NOW()
     WHERE id = $3`,
    [enrollHash, isReplacement ? 're_enrollment_required' : 'pending_enrollment', deviceId]
  );

  await revokeSessionsForDevice(deviceId, ctx.userId, 'device_re_enrollment_initiated');
  invalidateAllDeviceCaches();

  await logDeviceActivity({
    deviceId,
    actorAdminId: ctx.userId,
    eventType: isReplacement ? 're_enrollment_token_issued' : 'enrollment_token_issued',
    ipAddress: reqIp(req),
    details: { isReplacement },
  });
  await logAdminAction(
    ctx.userId,
    'issue_device_enrollment_token',
    'registered_devices',
    String(deviceId),
    { deviceUid: existing.device_uid, isReplacement },
    { ipAddress: reqIp(req), actionResult: 'success', deviceId, actorRole: ctx.adminRoleSlug }
  );

  res.json({ enrollmentToken: rawEnrollToken, isReplacement });
});

router.post('/admin/devices/:id/assign', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  const adminUserId = Number(req.body?.adminUserId);
  if (!adminUserId) {
    res.status(400).json({ error: 'adminUserId is required.' });
    return;
  }

  const [dev, adm] = await Promise.all([
    queryOne<any>('SELECT id, device_uid, is_active FROM registered_devices WHERE id = $1', [deviceId]),
    queryOne<any>("SELECT id, email FROM users WHERE id = $1 AND role IN ('owner', 'admin')", [adminUserId]),
  ]);
  if (!dev || !adm) {
    res.status(404).json({ error: 'Device or administrator not found.' });
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO admin_devices (admin_user_id, device_id, assigned_by_admin_id, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (admin_user_id, device_id) DO UPDATE SET
         is_active = TRUE, revoked_at = NULL, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id, assigned_at = NOW()`,
      [adminUserId, deviceId, ctx.userId]
    );
    await client.query('UPDATE registered_devices SET owner_admin_id = COALESCE(owner_admin_id, $1), updated_at = NOW() WHERE id = $2', [
      adminUserId,
      deviceId,
    ]);
    await logDeviceActivity({
      deviceId,
      adminUserId,
      actorAdminId: ctx.userId,
      eventType: 'device_assigned',
      ipAddress: reqIp(req),
      details: { adminEmail: adm.email },
      client,
    });
  });

  invalidateAllDeviceCaches();
  await logAdminAction(
    ctx.userId,
    'assign_device',
    'registered_devices',
    String(deviceId),
    { adminUserId, email: adm.email },
    { previousValue: '', newValue: `${dev.device_uid} -> ${adm.email}`, ipAddress: reqIp(req), actionResult: 'success', deviceId, actorRole: ctx.adminRoleSlug }
  );

  res.json({ ok: true });
});

router.post('/admin/devices/:id/reassign', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  const newAdminId = req.body?.newAdminId ? Number(req.body.newAdminId) : null;
  const transferClients = req.body?.transferClients !== false;

  const dev = await queryOne<any>('SELECT id, device_uid, owner_admin_id FROM registered_devices WHERE id = $1', [deviceId]);
  if (!dev) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  let newAdm: any = null;
  if (newAdminId) {
    newAdm = await queryOne<any>("SELECT id, email FROM users WHERE id = $1 AND role IN ('owner', 'admin')", [newAdminId]);
    if (!newAdm) {
      res.status(404).json({ error: 'Target administrator not found' });
      return;
    }
  }

  await withTransaction(async (client) => {
    const prevAdminsRes = await client.query<{ admin_user_id: number }>(
      'SELECT admin_user_id FROM admin_devices WHERE device_id = $1 AND is_active = TRUE',
      [deviceId]
    );

    // Revoke previous admin device mappings and sessions on this device
    await client.query(
      'UPDATE admin_devices SET is_active = FALSE, revoked_at = NOW() WHERE device_id = $1 AND is_active = TRUE',
      [deviceId]
    );

    for (const prev of prevAdminsRes.rows) {
      if (prev.admin_user_id !== newAdminId) {
        await revokeSessionsForDevice(deviceId, ctx.userId, 'device_reassigned', prev.admin_user_id, client);
      }
    }

    if (newAdminId) {
      await client.query(
        `INSERT INTO admin_devices (admin_user_id, device_id, assigned_by_admin_id, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (admin_user_id, device_id) DO UPDATE SET
           is_active = TRUE, revoked_at = NULL, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id, assigned_at = NOW()`,
        [newAdminId, deviceId, ctx.userId]
      );
    }

    await client.query('UPDATE registered_devices SET owner_admin_id = $1, updated_at = NOW() WHERE id = $2', [
      newAdminId,
      deviceId,
    ]);

    if (transferClients) {
      // Transfer device-bound client ownership cleanly to the new administrator (or mark pending if unassigned)
      const affectedClients = await client.query<{ user_id: number }>(
        `SELECT DISTINCT user_id FROM client_device_assignments WHERE device_id = $1 AND is_active = TRUE`,
        [deviceId]
      );

      await client.query(
        `UPDATE client_admin_assignments
         SET is_active = FALSE, revoked_at = NOW()
         WHERE device_id = $1 AND is_active = TRUE`,
        [deviceId]
      );

      for (const c of affectedClients.rows) {
        if (newAdminId) {
          await client.query(
            `UPDATE client_admin_assignments
             SET is_active = FALSE, revoked_at = NOW()
             WHERE user_id = $1 AND admin_user_id <> $2 AND is_active = TRUE`,
            [c.user_id, newAdminId]
          );
          await client.query(
            `INSERT INTO client_admin_assignments (user_id, admin_user_id, device_id, assigned_by_admin_id, verification_status, is_active)
             VALUES ($1, $2, $3, $4, 'verified', TRUE)
             ON CONFLICT (user_id, admin_user_id) DO UPDATE SET
               device_id = EXCLUDED.device_id, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id,
               is_active = TRUE, revoked_at = NULL, verification_status = 'verified', assigned_at = NOW()`,
            [c.user_id, newAdminId, deviceId, ctx.userId]
          );
          await client.query(
            `UPDATE users SET assigned_admin_id = $1, ownership_verification_status = 'verified', updated_at = NOW() WHERE id = $2`,
            [newAdminId, c.user_id]
          );
        } else {
          await client.query(
            `UPDATE users SET assigned_admin_id = NULL, ownership_verification_status = 'pending_verification', updated_at = NOW() WHERE id = $1`,
            [c.user_id]
          );
        }
      }
    }

    await logDeviceActivity({
      deviceId,
      adminUserId: newAdminId,
      actorAdminId: ctx.userId,
      eventType: 'device_reassigned',
      ipAddress: reqIp(req),
      details: { newAdminId, transferClients },
      client,
    });
  });

  invalidateAllDeviceCaches();
  await logAdminAction(
    ctx.userId,
    'reassign_device',
    'registered_devices',
    String(deviceId),
    { deviceUid: dev.device_uid, newAdminId, transferClients },
    {
      previousValue: `adminId=${dev.owner_admin_id || 'none'}`,
      newValue: newAdm ? `adminId=${newAdm.id} (${newAdm.email})` : 'unassigned',
      ipAddress: reqIp(req),
      actionResult: 'success',
      deviceId,
      actorRole: ctx.adminRoleSlug,
    }
  );

  res.json({ ok: true });
});

router.post('/admin/devices/:id/revoke', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  const reason = String(req.body?.reason || 'Revoked by Super Admin').slice(0, 180);

  const dev = await queryOne<any>('SELECT id, device_uid, owner_admin_id FROM registered_devices WHERE id = $1', [deviceId]);
  if (!dev) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE registered_devices
       SET is_active = FALSE, verification_status = 'revoked', revoked_at = NOW(), revoked_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, deviceId]
    );
    await client.query(
      'UPDATE admin_devices SET is_active = FALSE, revoked_at = NOW() WHERE device_id = $1 AND is_active = TRUE',
      [deviceId]
    );
    await revokeSessionsForDevice(deviceId, ctx.userId, reason, undefined, client);
    await logDeviceActivity({
      deviceId,
      adminUserId: dev.owner_admin_id,
      actorAdminId: ctx.userId,
      eventType: 'device_revoked',
      ipAddress: reqIp(req),
      details: { reason },
      client,
    });
  });

  invalidateAllDeviceCaches();
  await logAdminAction(
    ctx.userId,
    'revoke_device',
    'registered_devices',
    String(deviceId),
    { deviceUid: dev.device_uid, reason },
    { previousValue: 'active', newValue: 'revoked', ipAddress: reqIp(req), actionResult: 'success', deviceId, actorRole: ctx.adminRoleSlug }
  );

  res.json({ ok: true });
});

router.patch('/admin/devices/:id/status', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  const isActive = Boolean(req.body?.is_active);
  const dev = await queryOne<any>('SELECT id, device_uid, credential_hash FROM registered_devices WHERE id = $1', [deviceId]);
  if (!dev) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  await execute(
    `UPDATE registered_devices
     SET is_active = $1,
         revoked_at = CASE WHEN $1 = TRUE THEN NULL ELSE NOW() END,
         verification_status = CASE WHEN $1 = TRUE AND credential_hash IS NOT NULL THEN 'verified' WHEN $1 = TRUE THEN 'pending_enrollment' ELSE 'deactivated' END,
         updated_at = NOW()
     WHERE id = $2`,
    [isActive, deviceId]
  );

  if (!isActive) {
    await revokeSessionsForDevice(deviceId, ctx.userId, 'device_deactivated');
  }
  invalidateAllDeviceCaches();

  await logDeviceActivity({
    deviceId,
    actorAdminId: ctx.userId,
    eventType: isActive ? 'device_activated' : 'device_deactivated',
    ipAddress: reqIp(req),
  });
  await logAdminAction(
    ctx.userId,
    isActive ? 'activate_device' : 'deactivate_device',
    'registered_devices',
    String(deviceId),
    { deviceUid: dev.device_uid, isActive },
    { ipAddress: reqIp(req), actionResult: 'success', deviceId, actorRole: ctx.adminRoleSlug }
  );

  res.json({ ok: true, is_active: isActive });
});

router.get('/admin/devices/:id/history', requireDb, requireAdmin, requirePermission('devices.view'), async (req, res) => {
  const ctx = getAdminRequestContext(req)!;
  const deviceId = Number(req.params.id);
  if (!ctx.isSuperAdmin && !ctx.assignedDeviceIds.includes(deviceId)) {
    res.status(403).json({ error: 'Access denied to device history outside your assigned devices.' });
    return;
  }
  const logs = await query(
    `SELECT dl.id, dl.event_type, dl.ip_address, dl.user_agent, dl.details_json, dl.created_at,
            u.email as admin_email, actor.email as actor_email
     FROM device_activity_logs dl
     LEFT JOIN users u ON u.id = dl.admin_user_id
     LEFT JOIN users actor ON actor.id = dl.actor_admin_id
     WHERE dl.device_id = $1
     ORDER BY dl.id DESC LIMIT 60`,
    [deviceId]
  );
  res.json({ logs });
});

// =========================================================================
// 5. CLIENT OWNERSHIP MANAGEMENT & SESSION MONITORING (SUPER ADMIN ONLY)
// =========================================================================

router.get('/admin/ownership/clients', requireDb, requireAdmin, requireSuperAdmin, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const statusFilter = typeof req.query.ownership === 'string' ? req.query.ownership.trim() : '';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const where: string[] = ["u.role NOT IN ('owner', 'admin')"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length} OR LOWER(COALESCE(u.deriv_client_id, '')) LIKE $${params.length})`);
  }
  if (statusFilter) {
    params.push(statusFilter);
    where.push(`COALESCE(u.ownership_verification_status, 'pending_verification') = $${params.length}`);
  }

  params.push(limit, offset);
  const clients = await query(
    `SELECT u.id, u.email, u.full_name, u.deriv_client_id, u.status,
            u.originating_device_id, u.assigned_admin_id,
            COALESCE(u.ownership_verification_status, 'pending_verification') as ownership_verification_status,
            u.last_login_at, u.created_at,
            rd.device_uid as originating_device_uid, rd.device_name as originating_device_name,
            adm.email as assigned_admin_email, adm.full_name as assigned_admin_name
     FROM users u
     LEFT JOIN registered_devices rd ON rd.id = u.originating_device_id
     LEFT JOIN users adm ON adm.id = u.assigned_admin_id
     WHERE ${where.join(' AND ')}
     ORDER BY u.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ clients });
});

router.post('/admin/ownership/clients/:userId/assign', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const userId = Number(req.params.userId);
  const { adminUserId, deviceId } = req.body || {};

  const targetUser = await queryOne<any>(
    "SELECT id, email, assigned_admin_id, originating_device_id, ownership_verification_status FROM users WHERE id = $1 AND role NOT IN ('owner', 'admin')",
    [userId]
  );
  if (!targetUser) {
    res.status(404).json({ error: 'Client trader user not found.' });
    return;
  }

  const nextAdminId = adminUserId ? Number(adminUserId) : null;
  const nextDeviceId = deviceId ? Number(deviceId) : null;

  if (nextAdminId) {
    const adm = await queryOne("SELECT id FROM users WHERE id = $1 AND role IN ('owner', 'admin')", [nextAdminId]);
    if (!adm) {
      res.status(404).json({ error: 'Target administrator not found.' });
      return;
    }
  }
  if (nextDeviceId) {
    const dev = await queryOne('SELECT id FROM registered_devices WHERE id = $1', [nextDeviceId]);
    if (!dev) {
      res.status(404).json({ error: 'Target device not found.' });
      return;
    }
  }

  const nextVerification = nextAdminId || nextDeviceId ? 'verified' : 'pending_verification';

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE client_admin_assignments SET is_active = FALSE, revoked_at = NOW() WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    await client.query(
      'UPDATE client_device_assignments SET is_active = FALSE, revoked_at = NOW() WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );

    if (nextDeviceId) {
      await client.query(
        `INSERT INTO client_device_assignments (user_id, device_id, assigned_by_admin_id, assignment_source, verification_status, is_active)
         VALUES ($1, $2, $3, 'super_admin_reassign', 'verified', TRUE)
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           is_active = TRUE, revoked_at = NULL, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id, assigned_at = NOW()`,
        [userId, nextDeviceId, ctx.userId]
      );
    }
    if (nextAdminId) {
      await client.query(
        `INSERT INTO client_admin_assignments (user_id, admin_user_id, device_id, assigned_by_admin_id, verification_status, is_active)
         VALUES ($1, $2, $3, $4, 'verified', TRUE)
         ON CONFLICT (user_id, admin_user_id) DO UPDATE SET
           device_id = EXCLUDED.device_id, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id,
           is_active = TRUE, revoked_at = NULL, verification_status = 'verified', assigned_at = NOW()`,
        [userId, nextAdminId, nextDeviceId, ctx.userId]
      );
    }

    await client.query(
      `UPDATE users
       SET assigned_admin_id = $1,
           originating_device_id = COALESCE($2, originating_device_id),
           ownership_verification_status = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [nextAdminId, nextDeviceId, nextVerification, userId]
    );
  });

  await logAdminAction(
    ctx.userId,
    'reassign_client_ownership',
    'users',
    String(userId),
    { nextAdminId, nextDeviceId, nextVerification },
    {
      previousValue: `admin=${targetUser.assigned_admin_id || 'none'}, device=${targetUser.originating_device_id || 'none'}`,
      newValue: `admin=${nextAdminId || 'none'}, device=${nextDeviceId || 'same'} (${nextVerification})`,
      ipAddress: reqIp(req),
      actionResult: 'success',
      deviceId: nextDeviceId,
      actorRole: ctx.adminRoleSlug,
    }
  );

  res.json({ ok: true, ownership_verification_status: nextVerification });
});

router.get('/admin/sessions', requireDb, requireAdmin, requireSuperAdmin, async (_req, res) => {
  const sessions = await query(
    `SELECT s.id, s.session_jti, s.admin_user_id, s.device_id, s.ip_address, s.user_agent,
            s.status, s.expires_at, s.revoked_at, s.revoke_reason, s.last_seen_at, s.created_at,
            u.email as admin_email, u.full_name as admin_name, u.role as admin_role,
            rd.device_uid, rd.device_name
     FROM admin_sessions s
     JOIN users u ON u.id = s.admin_user_id
     LEFT JOIN registered_devices rd ON rd.id = s.device_id
     ORDER BY s.id DESC LIMIT 100`
  );
  res.json({ sessions });
});

router.post('/admin/sessions/:jti/revoke', requireDb, requireAdmin, requireSuperAdmin, async (req: AuthRequest, res) => {
  const ctx = getAdminRequestContext(req)!;
  const jti = String(req.params.jti || '').trim();
  if (!jti) {
    res.status(400).json({ error: 'Session identifier required.' });
    return;
  }
  await revokeAdminSessionByJti(jti, ctx.userId, 'super_admin_session_revoke');
  await logAdminAction(
    ctx.userId,
    'revoke_single_session',
    'admin_sessions',
    jti,
    { sessionJti: jti },
    { ipAddress: reqIp(req), actionResult: 'success', actorRole: ctx.adminRoleSlug }
  );
  res.json({ ok: true });
});

export default router;
