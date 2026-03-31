export default function FormSlugLoading() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-8 w-8 bg-muted rounded-lg" />
      </div>

      {/* Hero skeleton */}
      <div className="py-20 px-4 text-center space-y-4">
        <div className="h-10 w-2/3 bg-muted rounded-lg mx-auto" />
        <div className="h-5 w-1/2 bg-muted rounded mx-auto" />
        <div className="h-11 w-40 bg-muted rounded-xl mx-auto mt-6" />
      </div>

      {/* Form skeleton */}
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="bg-card rounded-2xl shadow-lg p-8 border border-border space-y-6">
          <div className="flex gap-2 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-1 h-2 bg-muted rounded-full" />
            ))}
          </div>
          <div className="h-5 w-1/3 bg-muted rounded" />
          <div className="h-11 w-full bg-muted rounded-lg" />
          <div className="h-11 w-full bg-muted rounded-lg" />
          <div className="h-11 w-28 bg-muted rounded-xl ml-auto" />
        </div>
      </div>
    </div>
  );
}
