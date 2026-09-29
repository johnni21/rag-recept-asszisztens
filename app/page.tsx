import { ChatInterface } from '@/components/chat-interface';
import { DocumentManager } from '@/components/document-manager';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
            RAG receptkereső
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Receptasszisztens
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-600">
            Tölts fel Markdown vagy text recepteket, dolgozd fel
            őket, majd kérdezz a saját receptgyűjteményedből.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <DocumentManager />
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}