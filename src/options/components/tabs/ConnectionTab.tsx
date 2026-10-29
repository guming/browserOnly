import { NotionSettings } from '../NotionSettings';
import { SlackSettings } from '../SlackSettings';

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
        <SlackSettings />
        {/* Notion Integration Card */}
        <NotionSettings
          notionEnabled={notionEnabled}
          setNotionEnabled={setNotionEnabled}
          notionBearerToken={notionBearerToken}
          setNotionBearerToken={setNotionBearerToken}
          notionDatabaseId={notionDatabaseId}
          setNotionDatabaseId={setNotionDatabaseId}
        />

      </div>
    </div>
  );
}
