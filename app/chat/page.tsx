import { ChatPanel } from "@/components/chat-panel";
import { getEnvWarning } from "@/lib/env";
import { getIndexStatus } from "@/lib/index-store";

export default async function ChatPage() {
  const [status, envWarning] = await Promise.all([getIndexStatus(), Promise.resolve(getEnvWarning())]);

  return (
    <main className="page-grid">
      <section className="hero">
        <h2>Grounded support chat</h2>
        <p>
          Each answer is generated from retrieved catalog snippets only. When the catalog does not
          contain enough information, the assistant should say so explicitly.
        </p>
        {status.warning ? <p className="warning">{status.warning}</p> : null}
        {envWarning ? <p className="warning">{envWarning}</p> : null}
      </section>

      <ChatPanel />
    </main>
  );
}
