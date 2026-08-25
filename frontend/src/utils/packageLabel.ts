import type { Package } from '../api';

/** 固件包展示：别名 + ID；无别名时退回 版本 + ID */
export function packageLabel(pkg: Pick<Package, 'package_id' | 'alias' | 'name' | 'version'>): string {
  const alias = (pkg.alias || pkg.name || '').trim();
  if (alias) return `${alias}（${pkg.package_id}）`;
  if (pkg.version) return `${pkg.version}（${pkg.package_id}）`;
  return pkg.package_id;
}

export function packageOptionLabel(pkg: Pick<Package, 'package_id' | 'alias' | 'name' | 'version' | 'product_code'>): string {
  const alias = (pkg.alias || pkg.name || '').trim();
  const base = alias || pkg.version || '未命名';
  const meta = [pkg.product_code, pkg.version].filter(Boolean).join(' / ');
  return meta ? `${base}（${pkg.package_id}）· ${meta}` : `${base}（${pkg.package_id}）`;
}
