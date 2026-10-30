import type { ManifestIssue } from '@app-lens/core';

export function IssuesView({ issues }: { issues: ManifestIssue[] }) {
  return (
    <div className="al-alert al-alert-error" role="alert">
      <strong>
        This manifest has {issues.length} problem{issues.length === 1 ? '' : 's'}.
      </strong>
      <ul className="al-issues">
        {issues.map((issue, index) => (
          <li key={index}>
            <code>{issue.path}</code> {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
