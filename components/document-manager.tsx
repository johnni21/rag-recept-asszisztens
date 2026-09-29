'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'processed'
  | 'failed';

type DocumentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  processedAt: string | null;
};

type DocumentsResponse = {
  success: boolean;
  documents?: DocumentItem[];
  error?: string;
};

const statusLabels: Record<DocumentStatus, string> = {
  uploaded: 'Feldolgozásra vár',
  processing: 'Feldolgozás alatt',
  processed: 'Feldolgozva',
  failed: 'Sikertelen',
};

const statusStyles: Record<DocumentStatus, string> = {
  uploaded: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  processed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
};

export function DocumentManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] =
    useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents', {
        cache: 'no-store',
      });
      const data = (await response.json()) as DocumentsResponse;

      if (!response.ok || !data.documents) {
        throw new Error(
          data.error ?? 'A dokumentumok betöltése sikertelen.',
        );
      }

      setDocuments(data.documents);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'A dokumentumok betöltése sikertelen.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setError('Válassz ki egy .md vagy .txt fájlt.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'A feltöltés sikertelen.',
        );
      }

      setMessage(`${file.name} feltöltése sikerült.`);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await loadDocuments();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'A feltöltés sikertelen.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = async (document: DocumentItem) => {
    setBusyDocumentId(document.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: document.id,
        }),
      });

      const data = (await response.json()) as {
        success: boolean;
        chunkCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'A feldolgozás sikertelen.',
        );
      }

      setMessage(
        `${document.fileName} feldolgozva ` +
          `(${data.chunkCount ?? 0} chunk).`,
      );

      await loadDocuments();
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : 'A feldolgozás sikertelen.',
      );
      await loadDocuments();
    } finally {
      setBusyDocumentId(null);
    }
  };

  const handleDelete = async (document: DocumentItem) => {
    const confirmed = window.confirm(
      `Biztosan törlöd ezt a dokumentumot?\n${document.fileName}`,
    );

    if (!confirmed) {
      return;
    }

    setBusyDocumentId(document.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/documents/${document.id}`,
        {
          method: 'DELETE',
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'A törlés sikertelen.',
        );
      }

      setMessage(`${document.fileName} törölve.`);
      await loadDocuments();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'A törlés sikertelen.',
      );
    } finally {
      setBusyDocumentId(null);
    }
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">
          Dokumentumok
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Markdown és text receptek feltöltése és feldolgozása.
        </p>
      </div>

      <form
        onSubmit={handleUpload}
        className="space-y-3 rounded-lg bg-zinc-50 p-4"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          className="block w-full text-sm"
          disabled={isUploading}
        />

        <button
          type="submit"
          disabled={isUploading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? 'Feltöltés...' : 'Feltöltés'}
        </button>
      </form>

      {message && (
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-zinc-500">
            Dokumentumok betöltése...
          </p>
        )}

        {!isLoading && documents.length === 0 && (
          <p className="text-sm text-zinc-500">
            Még nincs feltöltött dokumentum.
          </p>
        )}

        {documents.map(document => {
          const isBusy = busyDocumentId === document.id;

          return (
            <article
              key={document.id}
              className="rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">
                    {document.fileName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatFileSize(document.fileSize)}
                    {' · '}
                    {document.chunkCount} chunk
                  </p>
                </div>

                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[document.status]}`}
                >
                  {statusLabels[document.status]}
                </span>
              </div>

              {document.errorMessage && (
                <p className="mt-2 text-xs text-red-700">
                  {document.errorMessage}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleProcess(document)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                >
                  {isBusy
                    ? 'Folyamatban...'
                    : document.status === 'processed'
                      ? 'Újrafeldolgozás'
                      : 'Feldolgozás'}
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDelete(document)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Törlés
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
