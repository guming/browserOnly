import { PdfViewerSettings } from '../PdfViewerSettings';

interface FeaturesTabProps {
  pdfInterceptorEnabled: boolean;
  setPdfInterceptorEnabled: (enabled: boolean) => void;
}

export function FeaturesTab({
  pdfInterceptorEnabled,
  setPdfInterceptorEnabled
}: FeaturesTabProps) {
  return (
    <div className="container mx-auto max-w-3xl p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-base-content mb-1">⚙️ Features</h1>
        <p className="text-sm text-base-content/70">
          Enable or disable extension features to customize your browsing experience
        </p>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* PDF Viewer Settings */}
        <PdfViewerSettings
          pdfInterceptorEnabled={pdfInterceptorEnabled}
          setPdfInterceptorEnabled={setPdfInterceptorEnabled}
        />

        {/* Future Features Placeholder */}
        <div className="card bg-base-200/50 border border-dashed border-base-300/60">
          <div className="card-body text-center py-8">
            <div className="text-4xl mb-3">🚀</div>
            <h3 className="text-lg font-semibold text-base-content/70 mb-1">
              More Features Coming Soon
            </h3>
            <p className="text-sm text-base-content/50 max-w-sm mx-auto">
              We're continuously adding new features to enhance your productivity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
