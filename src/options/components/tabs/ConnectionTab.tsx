import { NotionSettings } from '../NotionSettings';

interface ConnectionTabProps {
  notionEnabled: boolean;
  setNotionEnabled: (enabled: boolean) => void;
  notionBearerToken: string;
  setNotionBearerToken: (token: string) => void;
  notionDatabaseId: string;
  setNotionDatabaseId: (databaseId: string) => void;
}

export function ConnectionTab({
  notionEnabled,
  setNotionEnabled,
  notionBearerToken,
  setNotionBearerToken,
  notionDatabaseId,
  setNotionDatabaseId
}: ConnectionTabProps) {

  return (
    <div className="container mx-auto max-w-3xl p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-base-content mb-1">🔗 Connections</h1>
        <p className="text-sm text-base-content/70">
          Connect external services to enhance your browsing experience
        </p>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Notion Integration Card */}
        <NotionSettings
          notionEnabled={notionEnabled}
          setNotionEnabled={setNotionEnabled}
          notionBearerToken={notionBearerToken}
          setNotionBearerToken={setNotionBearerToken}
          notionDatabaseId={notionDatabaseId}
          setNotionDatabaseId={setNotionDatabaseId}
        />

        {/* Future Integrations Placeholder */}
        <div className="card bg-base-200/50 border border-dashed border-base-300/60">
          <div className="card-body text-center py-8">
            <div className="text-4xl mb-3">🚧</div>
            <h3 className="text-lg font-semibold text-base-content/70 mb-1">
              More Integrations Coming Soon
            </h3>
            <p className="text-sm text-base-content/50 max-w-sm mx-auto">
              We're working on adding more service integrations to expand your productivity toolkit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}