export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Welcome to {"{{ProjectName}}"}
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Get started by editing{" "}
          <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
            src/app/page.tsx
          </code>
        </p>
      </div>
    </main>
  );
}
