package store

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

type PackageExt struct {
	PackageID   string    `json:"package_id"`
	ProductCode string    `json:"product_code"`
	Version     string    `json:"version"`
	FileHash    string    `json:"file_hash"`
	Signature   string    `json:"signature"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`

	// extended metadata
	Name     string `json:"name"`
	FileSize int64  `json:"file_size"`
}

func (q *Queries) ListPackagesExt(ctx context.Context, limit, offset int32) ([]PackageExt, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT package_id, product_code, version, file_hash, signature, status, created_at, name, file_size
FROM t_package
ORDER BY created_at DESC
LIMIT $1 OFFSET $2
`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]PackageExt, 0, limit)
	for rows.Next() {
		var i PackageExt
		if err := rows.Scan(&i.PackageID, &i.ProductCode, &i.Version, &i.FileHash, &i.Signature, &i.Status, &i.CreatedAt, &i.Name, &i.FileSize); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (q *Queries) GetPackageByIDExt(ctx context.Context, packageID string) (PackageExt, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT package_id, product_code, version, file_hash, signature, status, created_at, name, file_size
FROM t_package
WHERE package_id = $1
`, strings.TrimSpace(packageID))
	var out PackageExt
	err := row.Scan(&out.PackageID, &out.ProductCode, &out.Version, &out.FileHash, &out.Signature, &out.Status, &out.CreatedAt, &out.Name, &out.FileSize)
	return out, err
}

func (q *Queries) UpdatePackageNameAndSize(ctx context.Context, packageID string, name string, fileSize int64) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE t_package
SET name = $2,
    file_size = $3
WHERE package_id = $1
`, strings.TrimSpace(packageID), strings.TrimSpace(name), fileSize)
	return err
}

// helper for existing flows that return sql.ErrNoRows behavior
func isNoRows(err error) bool { return err == sql.ErrNoRows }

