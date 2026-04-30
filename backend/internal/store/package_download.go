package store

import (
	"context"
	"strings"
)

// UpdatePackageDownloadResult updates package metadata after background download finishes.
func (q *Queries) UpdatePackageDownloadResult(ctx context.Context, packageID, fileHash, signature, status, name string, fileSize int64) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE t_package
SET file_hash = $2,
    signature = $3,
    status = $4,
    name = $5,
    file_size = $6
WHERE package_id = $1
`, strings.TrimSpace(packageID), strings.TrimSpace(fileHash), signature, strings.TrimSpace(status), strings.TrimSpace(name), fileSize)
	return err
}

