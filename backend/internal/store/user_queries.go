package store

import (
  "context"
  "database/sql"
  "encoding/json"
  "time"
)

type UserRecord struct {
  UserID          string       `json:"user_id"`
  Username        string       `json:"username"`
  DisplayName     string       `json:"display_name"`
  PasswordHash    string       `json:"-"`
  Status          string       `json:"status"`
  AuthSource      string       `json:"auth_source"`
  LastLoginAt     sql.NullTime `json:"last_login_at"`
  LastOperationAt time.Time    `json:"last_operation_at"`
  CreatedAt       time.Time    `json:"created_at"`
  UpdatedAt       time.Time    `json:"updated_at"`
  Roles           []string     `json:"roles"`
}

type ListUsersParams struct {
  Limit  int32
  Offset int32
  Search string
  Status string
  Role   string
}

type CreateUserParams struct {
  UserID       string
  Username     string
  DisplayName  string
  PasswordHash string
  Status       string
  AuthSource   string
}

func (q *Queries) EnsureBootstrapLocalAdmin(ctx context.Context, username, displayName, passwordHash string) error {
  if _, err := q.db.ExecContext(ctx, `
INSERT INTO t_user (
  user_id,
  username,
  display_name,
  password_hash,
  status,
  auth_source,
  last_operation_at,
  updated_at
) VALUES ($1, $2, $3, $4, 'enabled', 'local', NOW(), NOW())
ON CONFLICT (username)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  password_hash = EXCLUDED.password_hash,
  status = 'enabled',
  auth_source = 'local',
  last_operation_at = NOW(),
  updated_at = NOW()
`, "user-bootstrap-local-admin", username, displayName, passwordHash); err != nil {
    return err
  }

  _, err := q.db.ExecContext(ctx, `
INSERT INTO t_user_role (user_id, role_code)
SELECT user_id, 'admin' FROM t_user WHERE username = $1
ON CONFLICT (user_id, role_code) DO NOTHING
`, username)
  return err
}

func scanUserWithRoles(scanner interface{ Scan(...interface{}) error }) (UserRecord, error) {
  var out UserRecord
  var rolesRaw []byte
  err := scanner.Scan(
    &out.UserID,
    &out.Username,
    &out.DisplayName,
    &out.PasswordHash,
    &out.Status,
    &out.AuthSource,
    &out.LastLoginAt,
    &out.LastOperationAt,
    &out.CreatedAt,
    &out.UpdatedAt,
    &rolesRaw,
  )
  if err != nil {
    return out, err
  }
  if len(rolesRaw) == 0 {
    out.Roles = []string{}
    return out, nil
  }
  if err := json.Unmarshal(rolesRaw, &out.Roles); err != nil {
    return out, err
  }
  return out, nil
}

func (q *Queries) ListUsers(ctx context.Context, arg ListUsersParams) ([]UserRecord, error) {
  rows, err := q.db.QueryContext(ctx, `
SELECT
  u.user_id,
  u.username,
  u.display_name,
  u.password_hash,
  u.status,
  u.auth_source,
  u.last_login_at,
  u.last_operation_at,
  u.created_at,
  u.updated_at,
  COALESCE(json_agg(ur.role_code ORDER BY ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '[]'::json) AS roles
FROM t_user u
LEFT JOIN t_user_role ur ON ur.user_id = u.user_id
WHERE ($1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%')
  AND ($2 = '' OR u.status = $2)
  AND ($3 = '' OR EXISTS (
    SELECT 1 FROM t_user_role eur WHERE eur.user_id = u.user_id AND eur.role_code = $3
  ))
GROUP BY u.user_id, u.username, u.display_name, u.password_hash, u.status, u.auth_source,
         u.last_login_at, u.last_operation_at, u.created_at, u.updated_at
ORDER BY u.created_at DESC
LIMIT $4 OFFSET $5
`, arg.Search, arg.Status, arg.Role, arg.Limit, arg.Offset)
  if err != nil {
    return nil, err
  }
  defer rows.Close()

  items := make([]UserRecord, 0, arg.Limit)
  for rows.Next() {
    item, err := scanUserWithRoles(rows)
    if err != nil {
      return nil, err
    }
    items = append(items, item)
  }
  if err := rows.Err(); err != nil {
    return nil, err
  }
  return items, nil
}

func (q *Queries) CountUsers(ctx context.Context, search, status, role string) (int64, error) {
  row := q.db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM t_user u
WHERE ($1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%')
  AND ($2 = '' OR u.status = $2)
  AND ($3 = '' OR EXISTS (
    SELECT 1 FROM t_user_role eur WHERE eur.user_id = u.user_id AND eur.role_code = $3
  ))
`, search, status, role)
  var count int64
  err := row.Scan(&count)
  return count, err
}

func (q *Queries) GetUserByID(ctx context.Context, userID string) (UserRecord, error) {
  row := q.db.QueryRowContext(ctx, `
SELECT
  u.user_id,
  u.username,
  u.display_name,
  u.password_hash,
  u.status,
  u.auth_source,
  u.last_login_at,
  u.last_operation_at,
  u.created_at,
  u.updated_at,
  COALESCE(json_agg(ur.role_code ORDER BY ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '[]'::json) AS roles
FROM t_user u
LEFT JOIN t_user_role ur ON ur.user_id = u.user_id
WHERE u.user_id = $1
GROUP BY u.user_id, u.username, u.display_name, u.password_hash, u.status, u.auth_source,
         u.last_login_at, u.last_operation_at, u.created_at, u.updated_at
`, userID)
  return scanUserWithRoles(row)
}

func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (UserRecord, error) {
  _, err := q.db.ExecContext(ctx, `
INSERT INTO t_user (
  user_id,
  username,
  display_name,
  password_hash,
  status,
  auth_source,
  last_operation_at,
  updated_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
`, arg.UserID, arg.Username, arg.DisplayName, arg.PasswordHash, arg.Status, arg.AuthSource)
  if err != nil {
    return UserRecord{}, err
  }
  return q.GetUserByID(ctx, arg.UserID)
}

func (q *Queries) UpdateUserStatus(ctx context.Context, userID, status string) (UserRecord, error) {
  if _, err := q.db.ExecContext(ctx, `
UPDATE t_user
SET status = $2, last_operation_at = NOW(), updated_at = NOW()
WHERE user_id = $1
`, userID, status); err != nil {
    return UserRecord{}, err
  }
  return q.GetUserByID(ctx, userID)
}

func (q *Queries) ResetUserPassword(ctx context.Context, userID, passwordHash string) (UserRecord, error) {
  if _, err := q.db.ExecContext(ctx, `
UPDATE t_user
SET password_hash = $2, last_operation_at = NOW(), updated_at = NOW()
WHERE user_id = $1
`, userID, passwordHash); err != nil {
    return UserRecord{}, err
  }
  return q.GetUserByID(ctx, userID)
}

func (q *Queries) ReplaceUserRoles(ctx context.Context, userID string, roles []string) error {
  if _, err := q.db.ExecContext(ctx, `DELETE FROM t_user_role WHERE user_id = $1`, userID); err != nil {
    return err
  }
  for _, role := range roles {
    if _, err := q.db.ExecContext(ctx, `
INSERT INTO t_user_role (user_id, role_code)
VALUES ($1, $2)
`, userID, role); err != nil {
      return err
    }
  }
  _, err := q.db.ExecContext(ctx, `
UPDATE t_user SET last_operation_at = NOW(), updated_at = NOW() WHERE user_id = $1
`, userID)
  return err
}