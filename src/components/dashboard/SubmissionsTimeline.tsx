import type { Submission } from "@/lib/db/schema";

const LABEL_MAP: Record<string, string> = {
  contentieux_fiscal: "Contentieux fiscal",
  recours_administratif: "Recours admin.",
  autre: "Autre",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

interface SubmissionsTimelineProps {
  submissions: Submission[];
}

export function SubmissionsTimeline({ submissions }: SubmissionsTimelineProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        Latest 20 submissions
      </h2>
      {submissions.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">
          Aucune soumission pour l&apos;instant.
        </p>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => {
            const formData = sub.formData as { requestType?: string };
            const requestType = formData?.requestType ?? "unknown";
            return (
              <div
                key={sub.id}
                className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
              >
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{sub.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {LABEL_MAP[requestType] ?? requestType}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDate(sub.submittedAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
